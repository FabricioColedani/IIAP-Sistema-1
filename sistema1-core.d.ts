/**
 * IIAP 2026 – Chocó Vanilla Tech
 * Sistema 1: Control Industrial y Automatización de Cámaras Climáticas
 *
 * Arquitectura SOLID completa con inyección de dependencias,
 * patrón Observer para alertas y control concurrente.
 */
export type Celsius = number;
export type PorcentajeHR = number;
export type MilisegundosPosix = number;
export declare enum EstadoExtractor {
    APAGADO = "APAGADO",
    ENCENDIDO = "ENCENDIDO"
}
export declare enum EstadoCalefactor {
    APAGADO = "APAGADO",
    ENCENDIDO = "ENCENDIDO"
}
export declare enum NivelAlarma {
    INFORMATIVO = "INFORMATIVO",
    ADVERTENCIA = "ADVERTENCIA",
    CRITICO = "CRITICO"
}
export declare enum EstadoEscaldado {
    INACTIVO = "INACTIVO",
    CALENTANDO = "CALENTANDO",
    ZONA_SEGURA = "ZONA_SEGURA",
    FUERA_DE_RANGO = "FUERA_DE_RANGO",
    COMPLETADO = "COMPLETADO",
    ABORTADO = "ABORTADO"
}
/**
 * ITermometro – lee temperatura en grados Celsius.
 * Implementado por cada driver físico de sensor (Tecnal, PT100, NTC…)
 */
export interface ITermometro {
    readonly sensorId: string;
    leerTemperatura(): Promise<Celsius>;
}
/**
 * IHigrometro – lee Humedad Relativa en porcentaje.
 */
export interface IHigrometro {
    readonly sensorId: string;
    leerHumedadRelativa(): Promise<PorcentajeHR>;
}
/**
 * IActuadorExtractor – controla el extractor de aire.
 */
export interface IActuadorExtractor {
    readonly actuadorId: string;
    encender(): Promise<void>;
    apagar(): Promise<void>;
    obtenerEstado(): EstadoExtractor;
}
/**
 * IActuadorCalefactor – controla el calefactor de la cámara.
 */
export interface IActuadorCalefactor {
    readonly actuadorId: string;
    encender(): Promise<void>;
    apagar(): Promise<void>;
    obtenerEstado(): EstadoCalefactor;
}
/**
 * IControladorEscaldado – abstracción del tanque de escaldado
 * (choque térmico / matado) para vainilla.
 */
export interface IControladorEscaldado {
    iniciarCiclo(duracionMs: number): Promise<ResultadoEscaldado>;
    abortar(): Promise<void>;
    obtenerEstado(): EstadoEscaldado;
    obtenerTemperaturaActual(): Promise<Celsius>;
}
/**
 * IRepositorioTelemetria – abstracción de persistencia (DIP).
 * El motor de control no conoce si el backend es Postgres, InfluxDB o SQLite.
 */
export interface IRepositorioTelemetria {
    guardarLectura(lectura: LecturaTelemetria): Promise<void>;
    guardarEventoAlarma(alarma: EventoAlarma): Promise<void>;
    guardarResultadoEscaldado(resultado: ResultadoEscaldado): Promise<void>;
}
/**
 * IObservadorAlarma – patrón Observer para alertas (OCP).
 * Cada canal de notificación implementa esta interfaz.
 */
export interface IObservadorAlarma {
    readonly observadorId: string;
    notificar(alarma: EventoAlarma): void;
}
export interface LecturaTelemetria {
    camaraId: string;
    timestamp: MilisegundosPosix;
    temperaturaC: Celsius;
    humedadRelativaPct: PorcentajeHR;
    estadoExtractor: EstadoExtractor;
    estadoCalefactor: EstadoCalefactor;
}
export interface EventoAlarma {
    alarmaId: string;
    camaraId: string;
    timestamp: MilisegundosPosix;
    nivel: NivelAlarma;
    mensaje: string;
    valorMedido: number;
    umbral: number;
    reconocida: boolean;
    timestampReconocimiento?: MilisegundosPosix;
    operarioId?: string;
}
export interface ResultadoEscaldado {
    cicloId: string;
    timestampInicio: MilisegundosPosix;
    timestampFin: MilisegundosPosix;
    duracionRealMs: number;
    temperaturaMin: Celsius;
    temperaturaMax: Celsius;
    temperaturaPromedio: Celsius;
    muestrasTemperatura: Array<{
        ts: MilisegundosPosix;
        tempC: Celsius;
    }>;
    estadoFinal: EstadoEscaldado;
    exitoso: boolean;
}
export declare const REGLAS_NEGOCIO: {
    /** Límite inferior de la zona segura de escaldado (°C) */
    readonly TEMP_ESCALDADO_MIN: Celsius;
    /** Límite superior de la zona segura de escaldado (°C) */
    readonly TEMP_ESCALDADO_MAX: Celsius;
    /** Duración exacta del proceso de escaldado (3 min en ms) */
    readonly DURACION_ESCALDADO_MS: number;
    /** Umbral crítico de Humedad Relativa – región Chocó (>90% ambiente) */
    readonly UMBRAL_HUMEDAD_CRITICA_PCT: PorcentajeHR;
    /** Humedad objetivo para las cámaras de curado */
    readonly HUMEDAD_OBJETIVO_PCT: PorcentajeHR;
    /** Temperatura objetivo para cámaras de curado */
    readonly TEMP_CAMARA_OBJETIVO_C: Celsius;
    /** Intervalo del bucle de control (ms) */
    readonly INTERVALO_BUCLE_MS: 5000;
    /** Tolerancia de temperatura para apagar calefactor (histéresis) */
    readonly HISTERESIS_TEMP_C: Celsius;
};
export declare class TermometroTecnal implements ITermometro {
    readonly sensorId: string;
    private readonly puertoSerial;
    private readonly direccionModbus;
    private _ultimaLectura;
    constructor(sensorId: string, puertoSerial: string, direccionModbus: number);
    /**
     * En producción: lectura Modbus RTU sobre RS-485.
     * Simulación inyectable para tests.
     */
    leerTemperatura(): Promise<Celsius>;
}
export declare class HigrometroTecnal implements IHigrometro {
    readonly sensorId: string;
    private readonly puertoI2C;
    private readonly direccionI2C;
    private _ultimaLectura;
    constructor(sensorId: string, puertoI2C: string, direccionI2C: number);
    leerHumedadRelativa(): Promise<PorcentajeHR>;
}
export declare class ExtractorTecnal implements IActuadorExtractor {
    readonly actuadorId: string;
    private readonly pinRelé;
    private readonly logFn;
    private _estado;
    constructor(actuadorId: string, pinRelé: number, logFn?: (msg: string) => void);
    encender(): Promise<void>;
    apagar(): Promise<void>;
    obtenerEstado(): EstadoExtractor;
}
export declare class CalefactorTecnal implements IActuadorCalefactor {
    readonly actuadorId: string;
    private readonly pinRelé;
    private readonly logFn;
    private _estado;
    constructor(actuadorId: string, pinRelé: number, logFn?: (msg: string) => void);
    encender(): Promise<void>;
    apagar(): Promise<void>;
    obtenerEstado(): EstadoCalefactor;
}
/**
 * ControladorTanqueEscaldado
 *
 * Implementa el proceso de choque térmico (matado) de la vainilla.
 * Regla crítica: temperatura estrictamente en 63–65 °C durante 3 minutos
 * ininterrumpidos. Si la temperatura sale del rango, se aborta el ciclo.
 */
export declare class ControladorTanqueEscaldado implements IControladorEscaldado {
    private readonly termometro;
    private readonly repositorio;
    private readonly logFn;
    private _estado;
    private _abortarCiclo;
    private readonly INTERVALO_MUESTREO_MS;
    constructor(termometro: ITermometro, repositorio: IRepositorioTelemetria, logFn?: (msg: string) => void);
    obtenerEstado(): EstadoEscaldado;
    obtenerTemperaturaActual(): Promise<Celsius>;
    abortar(): Promise<void>;
    /**
     * Ejecuta un ciclo de escaldado completo.
     * El temporizador de 3 min se REINICIA si la temperatura sale del rango.
     * Retorna el resultado detallado del ciclo para trazabilidad.
     */
    iniciarCiclo(duracionMs?: number): Promise<ResultadoEscaldado>;
    private _esperar;
}
/**
 * GestorAlarmas
 *
 * Mantiene el registro de alarmas activas y notifica a los observadores
 * suscritos. Implementa acknowledgeAlarma() para confirmación manual.
 */
export declare class GestorAlarmas {
    private readonly _observadores;
    private readonly _alarmasActivas;
    suscribir(observador: IObservadorAlarma): void;
    desuscribir(observadorId: string): void;
    /**
     * Emite una nueva alarma y notifica a todos los observadores suscritos.
     */
    emitir(alarma: EventoAlarma): void;
    /**
     * Confirmación manual de alarma por parte del operario.
     * Una alarma reconocida deja de figurar como activa pendiente.
     */
    acknowledgeAlarma(alarmaId: string, operarioId: string): void;
    obtenerAlarmasActivas(): EventoAlarma[];
    obtenerTodasLasAlarmas(): EventoAlarma[];
}
/** Observador que escribe alarmas en el log de consola */
export declare class ObservadorLogConsola implements IObservadorAlarma {
    readonly observadorId = "obs-log-consola";
    notificar(alarma: EventoAlarma): void;
}
/** Observador que persiste alarmas en base de datos (DIP) */
export declare class ObservadorPersistenciaAlarma implements IObservadorAlarma {
    private readonly repositorio;
    readonly observadorId = "obs-persistencia";
    constructor(repositorio: IRepositorioTelemetria);
    notificar(alarma: EventoAlarma): void;
}
/** Observador que enviaría alerta por canal HTTP/MQTT en producción */
export declare class ObservadorNotificacionRemota implements IObservadorAlarma {
    private readonly endpointWebhook;
    private readonly fetchFn;
    readonly observadorId = "obs-notificacion-remota";
    constructor(endpointWebhook: string, fetchFn?: typeof fetch);
    notificar(alarma: EventoAlarma): void;
}
export interface ConfiguracionCamara {
    camaraId: string;
    marca: string;
    modelo: string;
    ubicacion: string;
}
/**
 * BucleControlCamara
 *
 * Motor de control PID simplificado (on/off con histéresis) para la cámara.
 * Responsabilidad única: evaluar telemetría y actuar sobre actuadores.
 * No persiste ni notifica directamente; delega al repositorio y al gestor.
 *
 * Chocó: humedad ambiente persistente >90% → si la HR sube del 75%,
 * activa extractores inmediatamente y emite alarma crítica.
 */
export declare class BucleControlCamara {
    private readonly config;
    private readonly termometro;
    private readonly higrometro;
    private readonly extractor;
    private readonly calefactor;
    private readonly gestor;
    private readonly repositorio;
    private readonly logFn;
    private _activo;
    private _intervaloRef;
    private _contadorIteraciones;
    constructor(config: ConfiguracionCamara, termometro: ITermometro, higrometro: IHigrometro, extractor: IActuadorExtractor, calefactor: IActuadorCalefactor, gestor: GestorAlarmas, repositorio: IRepositorioTelemetria, logFn?: (msg: string) => void);
    /**
     * Inicia el bucle de control periódico.
     * Seguro para llamar múltiples veces (idempotente).
     */
    iniciar(): void;
    /**
     * Detiene el bucle de control de forma limpia.
     */
    detener(): Promise<void>;
    /**
     * Una iteración del bucle de control.
     * Lectura → Evaluación → Acción → Persistencia
     */
    private _iteracion;
    /**
     * Evalúa la humedad y activa extractores si supera el umbral crítico.
     * Región Chocó: humedad ambiente >90%, umbral de actuación 75%.
     */
    private _evaluarHumedad;
    /**
     * Evalúa la temperatura y controla el calefactor con histéresis de 1°C.
     */
    private _evaluarTemperatura;
}
export declare class RepositorioMemoria implements IRepositorioTelemetria {
    private readonly _lecturas;
    private readonly _alarmas;
    private readonly _escaldados;
    guardarLectura(lectura: LecturaTelemetria): Promise<void>;
    guardarEventoAlarma(alarma: EventoAlarma): Promise<void>;
    guardarResultadoEscaldado(resultado: ResultadoEscaldado): Promise<void>;
    obtenerLecturas(camaraId?: string): LecturaTelemetria[];
    obtenerAlarmas(): EventoAlarma[];
    obtenerEscaldados(): ResultadoEscaldado[];
}
/**
 * FabricaSistema1
 * Punto único de composición: ensambla los objetos del sistema.
 * Cambiar de Tecnal a otra marca = cambiar solo esta fábrica.
 */
export declare class FabricaSistema1 {
    static crearCamaraCompleta(config: ConfiguracionCamara): {
        bucle: BucleControlCamara;
        gestor: GestorAlarmas;
        repositorio: RepositorioMemoria;
        tanque: ControladorTanqueEscaldado;
    };
}
//# sourceMappingURL=sistema1-core.d.ts.map