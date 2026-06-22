/**
 * IIAP 2026 – Chocó Vanilla Tech
 * Sistema 1: Control Industrial y Automatización de Cámaras Climáticas
 * 
 * Arquitectura SOLID completa con inyección de dependencias,
 * patrón Observer para alertas y control concurrente.
 */

// ============================================================
// I. TIPOS DE DOMINIO
// ============================================================

export type Celsius = number;
export type PorcentajeHR = number; // Humedad Relativa 0–100
export type MilisegundosPosix = number;

export enum EstadoExtractor {
  APAGADO = "APAGADO",
  ENCENDIDO = "ENCENDIDO",
}

export enum EstadoCalefactor {
  APAGADO = "APAGADO",
  ENCENDIDO = "ENCENDIDO",
}

export enum NivelAlarma {
  INFORMATIVO = "INFORMATIVO",
  ADVERTENCIA = "ADVERTENCIA",
  CRITICO = "CRITICO",
}

export enum EstadoEscaldado {
  INACTIVO = "INACTIVO",
  CALENTANDO = "CALENTANDO",
  ZONA_SEGURA = "ZONA_SEGURA",
  FUERA_DE_RANGO = "FUERA_DE_RANGO",
  COMPLETADO = "COMPLETADO",
  ABORTADO = "ABORTADO",
}

// ============================================================
// II. INTERFACES ATÓMICAS DE HARDWARE (ISP – Segregación)
// ============================================================

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

// ============================================================
// III. ESTRUCTURAS DE DATOS DE DOMINIO
// ============================================================

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
  muestrasTemperatura: Array<{ ts: MilisegundosPosix; tempC: Celsius }>;
  estadoFinal: EstadoEscaldado;
  exitoso: boolean;
}

// ============================================================
// IV. CONSTANTES DE NEGOCIO (REGLAS GEOGRÁFICAS CHOCÓ)
// ============================================================

export const REGLAS_NEGOCIO = {
  /** Límite inferior de la zona segura de escaldado (°C) */
  TEMP_ESCALDADO_MIN: 63 as Celsius,
  /** Límite superior de la zona segura de escaldado (°C) */
  TEMP_ESCALDADO_MAX: 65 as Celsius,
  /** Duración exacta del proceso de escaldado (3 min en ms) */
  DURACION_ESCALDADO_MS: 3 * 60 * 1000,
  /** Umbral crítico de Humedad Relativa – región Chocó (>90% ambiente) */
  UMBRAL_HUMEDAD_CRITICA_PCT: 75 as PorcentajeHR,
  /** Humedad objetivo para las cámaras de curado */
  HUMEDAD_OBJETIVO_PCT: 65 as PorcentajeHR,
  /** Temperatura objetivo para cámaras de curado */
  TEMP_CAMARA_OBJETIVO_C: 28 as Celsius,
  /** Intervalo del bucle de control (ms) */
  INTERVALO_BUCLE_MS: 5_000,
  /** Tolerancia de temperatura para apagar calefactor (histéresis) */
  HISTERESIS_TEMP_C: 1 as Celsius,
} as const;

// ============================================================
// V. DRIVERS DE HARDWARE – IMPLEMENTACIONES TECNAL (LSP)
// ============================================================
// Estos drivers implementan las interfaces atómicas.
// Sustituibles por cualquier otra marca sin cambiar el bucle de control.

export class TermometroTecnal implements ITermometro {
  private _ultimaLectura: Celsius = 22.0;

  constructor(
    public readonly sensorId: string,
    private readonly puertoSerial: string,
    private readonly direccionModbus: number
  ) {}

  /**
   * En producción: lectura Modbus RTU sobre RS-485.
   * Simulación inyectable para tests.
   */
  async leerTemperatura(): Promise<Celsius> {
    // Producción: comunicación Modbus real
    // const registro = await modbusClient.readInputRegisters(this.direccionModbus, 1);
    // return registro.data[0] / 10;
    
    // Simulación determinista para entorno de pruebas
    const variacion = (Math.random() - 0.5) * 0.8;
    this._ultimaLectura = Math.max(15, Math.min(80, this._ultimaLectura + variacion));
    return parseFloat(this._ultimaLectura.toFixed(1));
  }
}

export class HigrometroTecnal implements IHigrometro {
  private _ultimaLectura: PorcentajeHR = 68.0;

  constructor(
    public readonly sensorId: string,
    private readonly puertoI2C: string,
    private readonly direccionI2C: number
  ) {}

  async leerHumedadRelativa(): Promise<PorcentajeHR> {
    // Producción: protocolo I2C / SHT31 / HTU21D
    // const rawData = await i2cBus.readI2cBlock(this.direccionI2C, 0xE0, 6, Buffer.alloc(6));
    // return calcularHumedad(rawData);

    const variacion = (Math.random() - 0.5) * 2;
    this._ultimaLectura = Math.max(30, Math.min(99, this._ultimaLectura + variacion));
    return parseFloat(this._ultimaLectura.toFixed(1));
  }
}

export class ExtractorTecnal implements IActuadorExtractor {
  private _estado: EstadoExtractor = EstadoExtractor.APAGADO;

  constructor(
    public readonly actuadorId: string,
    private readonly pinRelé: number,
    private readonly logFn: (msg: string) => void = console.log
  ) {}

  async encender(): Promise<void> {
    if (this._estado === EstadoExtractor.ENCENDIDO) return;
    // Producción: GPIO.write(this.pinRelé, 1);
    this._estado = EstadoExtractor.ENCENDIDO;
    this.logFn(`[${this.actuadorId}] Extractor ENCENDIDO (pin ${this.pinRelé})`);
  }

  async apagar(): Promise<void> {
    if (this._estado === EstadoExtractor.APAGADO) return;
    // Producción: GPIO.write(this.pinRelé, 0);
    this._estado = EstadoExtractor.APAGADO;
    this.logFn(`[${this.actuadorId}] Extractor APAGADO (pin ${this.pinRelé})`);
  }

  obtenerEstado(): EstadoExtractor {
    return this._estado;
  }
}

export class CalefactorTecnal implements IActuadorCalefactor {
  private _estado: EstadoCalefactor = EstadoCalefactor.APAGADO;

  constructor(
    public readonly actuadorId: string,
    private readonly pinRelé: number,
    private readonly logFn: (msg: string) => void = console.log
  ) {}

  async encender(): Promise<void> {
    if (this._estado === EstadoCalefactor.ENCENDIDO) return;
    this._estado = EstadoCalefactor.ENCENDIDO;
    this.logFn(`[${this.actuadorId}] Calefactor ENCENDIDO (pin ${this.pinRelé})`);
  }

  async apagar(): Promise<void> {
    if (this._estado === EstadoCalefactor.APAGADO) return;
    this._estado = EstadoCalefactor.APAGADO;
    this.logFn(`[${this.actuadorId}] Calefactor APAGADO (pin ${this.pinRelé})`);
  }

  obtenerEstado(): EstadoCalefactor {
    return this._estado;
  }
}

// ============================================================
// VI. CONTROLADOR DEL TANQUE DE ESCALDADO
// ============================================================

/**
 * ControladorTanqueEscaldado
 * 
 * Implementa el proceso de choque térmico (matado) de la vainilla.
 * Regla crítica: temperatura estrictamente en 63–65 °C durante 3 minutos
 * ininterrumpidos. Si la temperatura sale del rango, se aborta el ciclo.
 */
export class ControladorTanqueEscaldado implements IControladorEscaldado {
  private _estado: EstadoEscaldado = EstadoEscaldado.INACTIVO;
  private _abortarCiclo = false;
  private readonly INTERVALO_MUESTREO_MS = 2_000;

  constructor(
    private readonly termometro: ITermometro,
    private readonly repositorio: IRepositorioTelemetria,
    private readonly logFn: (msg: string) => void = console.log
  ) {}

  obtenerEstado(): EstadoEscaldado {
    return this._estado;
  }

  async obtenerTemperaturaActual(): Promise<Celsius> {
    return this.termometro.leerTemperatura();
  }

  async abortar(): Promise<void> {
    this._abortarCiclo = true;
    this.logFn("[ESCALDADO] Solicitud de aborto recibida.");
  }

  /**
   * Ejecuta un ciclo de escaldado completo.
   * El temporizador de 3 min se REINICIA si la temperatura sale del rango.
   * Retorna el resultado detallado del ciclo para trazabilidad.
   */
  async iniciarCiclo(
    duracionMs: number = REGLAS_NEGOCIO.DURACION_ESCALDADO_MS
  ): Promise<ResultadoEscaldado> {
    if (this._estado !== EstadoEscaldado.INACTIVO && this._estado !== EstadoEscaldado.COMPLETADO && this._estado !== EstadoEscaldado.ABORTADO) {
      throw new Error(`No se puede iniciar ciclo: estado actual es ${this._estado}`);
    }

    const cicloId = `ESC-${Date.now()}`;
    const timestampInicio = Date.now();
    this._abortarCiclo = false;
    this._estado = EstadoEscaldado.CALENTANDO;

    const muestras: Array<{ ts: MilisegundosPosix; tempC: Celsius }> = [];
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let sumaTemp = 0;
    let tiempoEnZonaMs = 0;
    let ultimoTsEnZona: MilisegundosPosix | null = null;

    this.logFn(`[ESCALDADO ${cicloId}] Ciclo iniciado. Objetivo: ${REGLAS_NEGOCIO.TEMP_ESCALDADO_MIN}–${REGLAS_NEGOCIO.TEMP_ESCALDADO_MAX}°C durante ${duracionMs / 60000} min`);

    // Bucle de muestreo hasta completar el tiempo en zona segura
    while (!this._abortarCiclo) {
      const ahora = Date.now();
      const tempActual = await this.termometro.leerTemperatura();

      // Actualizar estadísticas
      muestras.push({ ts: ahora, tempC: tempActual });
      if (tempActual < tempMin) tempMin = tempActual;
      if (tempActual > tempMax) tempMax = tempActual;
      sumaTemp += tempActual;

      const enZonaSegura =
        tempActual >= REGLAS_NEGOCIO.TEMP_ESCALDADO_MIN &&
        tempActual <= REGLAS_NEGOCIO.TEMP_ESCALDADO_MAX;

      if (enZonaSegura) {
        if (this._estado !== EstadoEscaldado.ZONA_SEGURA) {
          this._estado = EstadoEscaldado.ZONA_SEGURA;
          ultimoTsEnZona = ahora;
          this.logFn(`[ESCALDADO ${cicloId}] ✅ Temperatura ${tempActual}°C – En zona segura. Iniciando conteo.`);
        }

        // Acumular tiempo continuo en zona
        if (ultimoTsEnZona !== null) {
          tiempoEnZonaMs += this.INTERVALO_MUESTREO_MS;
        }

        if (tiempoEnZonaMs >= duracionMs) {
          break; // Ciclo completado exitosamente
        }

        this.logFn(
          `[ESCALDADO ${cicloId}] 🌡 ${tempActual}°C | ` +
          `Tiempo en zona: ${(tiempoEnZonaMs / 1000).toFixed(0)}s / ${duracionMs / 1000}s`
        );
      } else {
        // Temperatura fuera del rango – reiniciar el contador de tiempo
        if (this._estado === EstadoEscaldado.ZONA_SEGURA) {
          this.logFn(
            `[ESCALDADO ${cicloId}] ⚠️ Temperatura ${tempActual}°C salió del rango. ` +
            `Contador reiniciado.`
          );
        }
        this._estado = EstadoEscaldado.FUERA_DE_RANGO;
        tiempoEnZonaMs = 0;
        ultimoTsEnZona = null;
      }

      await this._esperar(this.INTERVALO_MUESTREO_MS);
    }

    const timestampFin = Date.now();
    const estadoFinal = this._abortarCiclo
      ? EstadoEscaldado.ABORTADO
      : EstadoEscaldado.COMPLETADO;

    this._estado = estadoFinal;

    const resultado: ResultadoEscaldado = {
      cicloId,
      timestampInicio,
      timestampFin,
      duracionRealMs: timestampFin - timestampInicio,
      temperaturaMin: tempMin === Infinity ? 0 : tempMin,
      temperaturaMax: tempMax === -Infinity ? 0 : tempMax,
      temperaturaPromedio: muestras.length > 0 ? sumaTemp / muestras.length : 0,
      muestrasTemperatura: muestras,
      estadoFinal,
      exitoso: estadoFinal === EstadoEscaldado.COMPLETADO,
    };

    await this.repositorio.guardarResultadoEscaldado(resultado);

    this.logFn(
      `[ESCALDADO ${cicloId}] ${resultado.exitoso ? "✅ COMPLETADO" : "❌ ABORTADO"} | ` +
      `T̄=${resultado.temperaturaPromedio.toFixed(1)}°C | ` +
      `Duración real: ${(resultado.duracionRealMs / 1000).toFixed(0)}s`
    );

    return resultado;
  }

  private _esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// VII. GESTOR DE ALARMAS CON PATRÓN OBSERVER
// ============================================================

/**
 * GestorAlarmas
 * 
 * Mantiene el registro de alarmas activas y notifica a los observadores
 * suscritos. Implementa acknowledgeAlarma() para confirmación manual.
 */
export class GestorAlarmas {
  private readonly _observadores: Map<string, IObservadorAlarma> = new Map();
  private readonly _alarmasActivas: Map<string, EventoAlarma> = new Map();

  suscribir(observador: IObservadorAlarma): void {
    this._observadores.set(observador.observadorId, observador);
  }

  desuscribir(observadorId: string): void {
    this._observadores.delete(observadorId);
  }

  /**
   * Emite una nueva alarma y notifica a todos los observadores suscritos.
   */
  emitir(alarma: EventoAlarma): void {
    this._alarmasActivas.set(alarma.alarmaId, alarma);
    for (const observador of this._observadores.values()) {
      observador.notificar(alarma);
    }
  }

  /**
   * Confirmación manual de alarma por parte del operario.
   * Una alarma reconocida deja de figurar como activa pendiente.
   */
  acknowledgeAlarma(alarmaId: string, operarioId: string): void {
    const alarma = this._alarmasActivas.get(alarmaId);
    if (!alarma) {
      throw new Error(`Alarma ${alarmaId} no encontrada o ya fue reconocida.`);
    }
    const alarmaReconocida: EventoAlarma = {
      ...alarma,
      reconocida: true,
      timestampReconocimiento: Date.now(),
      operarioId,
    };
    this._alarmasActivas.set(alarmaId, alarmaReconocida);
    console.log(
      `[GestorAlarmas] Alarma ${alarmaId} reconocida por operario ${operarioId} ` +
      `a las ${new Date(alarmaReconocida.timestampReconocimiento!).toISOString()}`
    );
  }

  obtenerAlarmasActivas(): EventoAlarma[] {
    return [...this._alarmasActivas.values()].filter((a) => !a.reconocida);
  }

  obtenerTodasLasAlarmas(): EventoAlarma[] {
    return [...this._alarmasActivas.values()];
  }
}

// ============================================================
// VIII. OBSERVADORES CONCRETOS (OCP – extensible sin modificar)
// ============================================================

/** Observador que escribe alarmas en el log de consola */
export class ObservadorLogConsola implements IObservadorAlarma {
  readonly observadorId = "obs-log-consola";

  notificar(alarma: EventoAlarma): void {
    const nivel = alarma.nivel === NivelAlarma.CRITICO ? "🚨" :
                  alarma.nivel === NivelAlarma.ADVERTENCIA ? "⚠️" : "ℹ️";
    console.warn(
      `${nivel} [${alarma.nivel}] Cámara ${alarma.camaraId} | ` +
      `${alarma.mensaje} | Valor: ${alarma.valorMedido} | Umbral: ${alarma.umbral}`
    );
  }
}

/** Observador que persiste alarmas en base de datos (DIP) */
export class ObservadorPersistenciaAlarma implements IObservadorAlarma {
  readonly observadorId = "obs-persistencia";

  constructor(private readonly repositorio: IRepositorioTelemetria) {}

  notificar(alarma: EventoAlarma): void {
    // Fire-and-forget con manejo de errores
    this.repositorio.guardarEventoAlarma(alarma).catch((err) => {
      console.error("[ObservadorPersistenciaAlarma] Error al persistir:", err);
    });
  }
}

/** Observador que enviaría alerta por canal HTTP/MQTT en producción */
export class ObservadorNotificacionRemota implements IObservadorAlarma {
  readonly observadorId = "obs-notificacion-remota";

  constructor(
    private readonly endpointWebhook: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  notificar(alarma: EventoAlarma): void {
    if (alarma.nivel !== NivelAlarma.CRITICO) return; // Solo críticos van al webhook

    this.fetchFn(this.endpointWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alarma),
    }).catch((err) => {
      console.error("[ObservadorNotificacionRemota] Fallo webhook:", err);
    });
  }
}

// ============================================================
// IX. BUCLE DE CONTROL DE CÁMARA CLIMÁTICA
// ============================================================

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
export class BucleControlCamara {
  private _activo = false;
  private _intervaloRef: ReturnType<typeof setInterval> | null = null;
  private _contadorIteraciones = 0;

  constructor(
    private readonly config: ConfiguracionCamara,
    private readonly termometro: ITermometro,
    private readonly higrometro: IHigrometro,
    private readonly extractor: IActuadorExtractor,
    private readonly calefactor: IActuadorCalefactor,
    private readonly gestor: GestorAlarmas,
    private readonly repositorio: IRepositorioTelemetria,
    private readonly logFn: (msg: string) => void = console.log
  ) {}

  /**
   * Inicia el bucle de control periódico.
   * Seguro para llamar múltiples veces (idempotente).
   */
  iniciar(): void {
    if (this._activo) return;
    this._activo = true;
    this._intervaloRef = setInterval(
      () => this._iteracion().catch((err) => this.logFn(`[BucleControl] Error en iteración: ${err}`)),
      REGLAS_NEGOCIO.INTERVALO_BUCLE_MS
    );
    this.logFn(`[BucleControl ${this.config.camaraId}] Bucle iniciado (cada ${REGLAS_NEGOCIO.INTERVALO_BUCLE_MS / 1000}s)`);
  }

  /**
   * Detiene el bucle de control de forma limpia.
   */
  async detener(): Promise<void> {
    if (!this._activo) return;
    this._activo = false;
    if (this._intervaloRef !== null) {
      clearInterval(this._intervaloRef);
      this._intervaloRef = null;
    }
    // Seguridad: apagar actuadores al detener el bucle
    await Promise.all([this.extractor.apagar(), this.calefactor.apagar()]);
    this.logFn(`[BucleControl ${this.config.camaraId}] Bucle detenido. Actuadores apagados.`);
  }

  /**
   * Una iteración del bucle de control.
   * Lectura → Evaluación → Acción → Persistencia
   */
  private async _iteracion(): Promise<void> {
    this._contadorIteraciones++;
    const timestamp = Date.now();

    const [temperaturaC, humedadRelativaPct] = await Promise.all([
      this.termometro.leerTemperatura(),
      this.higrometro.leerHumedadRelativa(),
    ]);

    // ── REGLA 1: Control de Humedad (Chocó – umbral 75%) ──────────────
    await this._evaluarHumedad(humedadRelativaPct, timestamp);

    // ── REGLA 2: Control de Temperatura (histéresis ±1°C) ─────────────
    await this._evaluarTemperatura(temperaturaC, timestamp);

    // ── PERSISTENCIA DE TELEMETRÍA ─────────────────────────────────────
    const lectura: LecturaTelemetria = {
      camaraId: this.config.camaraId,
      timestamp,
      temperaturaC,
      humedadRelativaPct,
      estadoExtractor: this.extractor.obtenerEstado(),
      estadoCalefactor: this.calefactor.obtenerEstado(),
    };

    await this.repositorio.guardarLectura(lectura);

    this.logFn(
      `[${this.config.camaraId}] it#${this._contadorIteraciones} | ` +
      `T=${temperaturaC}°C | HR=${humedadRelativaPct}% | ` +
      `Ext=${this.extractor.obtenerEstado()} | Cal=${this.calefactor.obtenerEstado()}`
    );
  }

  /**
   * Evalúa la humedad y activa extractores si supera el umbral crítico.
   * Región Chocó: humedad ambiente >90%, umbral de actuación 75%.
   */
  private async _evaluarHumedad(hr: PorcentajeHR, timestamp: MilisegundosPosix): Promise<void> {
    if (hr > REGLAS_NEGOCIO.UMBRAL_HUMEDAD_CRITICA_PCT) {
      await this.extractor.encender();

      const alarma: EventoAlarma = {
        alarmaId: `ALM-HR-${this.config.camaraId}-${timestamp}`,
        camaraId: this.config.camaraId,
        timestamp,
        nivel: NivelAlarma.CRITICO,
        mensaje: `Humedad Relativa CRÍTICA: ${hr}% supera umbral de ${REGLAS_NEGOCIO.UMBRAL_HUMEDAD_CRITICA_PCT}%. Extractor activado. Riesgo de hongos/moho.`,
        valorMedido: hr,
        umbral: REGLAS_NEGOCIO.UMBRAL_HUMEDAD_CRITICA_PCT,
        reconocida: false,
      };

      this.gestor.emitir(alarma);
    } else if (hr <= REGLAS_NEGOCIO.HUMEDAD_OBJETIVO_PCT) {
      // HR en zona óptima → apagar extractor (ahorro energético)
      await this.extractor.apagar();
    }
    // Entre 65% y 75%: mantener estado actual del extractor (histéresis)
  }

  /**
   * Evalúa la temperatura y controla el calefactor con histéresis de 1°C.
   */
  private async _evaluarTemperatura(temp: Celsius, timestamp: MilisegundosPosix): Promise<void> {
    const objetivo = REGLAS_NEGOCIO.TEMP_CAMARA_OBJETIVO_C;
    const histeresis = REGLAS_NEGOCIO.HISTERESIS_TEMP_C;

    if (temp < objetivo - histeresis) {
      await this.calefactor.encender();
    } else if (temp > objetivo + histeresis) {
      await this.calefactor.apagar();

      if (temp > objetivo + 5) {
        const alarma: EventoAlarma = {
          alarmaId: `ALM-TEMP-${this.config.camaraId}-${timestamp}`,
          camaraId: this.config.camaraId,
          timestamp,
          nivel: NivelAlarma.ADVERTENCIA,
          mensaje: `Temperatura elevada: ${temp}°C supera el objetivo de ${objetivo}°C por más de 5°C.`,
          valorMedido: temp,
          umbral: objetivo + 5,
          reconocida: false,
        };
        this.gestor.emitir(alarma);
      }
    }
  }
}

// ============================================================
// X. REPOSITORIO EN MEMORIA (para pruebas / sin base de datos)
// ============================================================

export class RepositorioMemoria implements IRepositorioTelemetria {
  private readonly _lecturas: LecturaTelemetria[] = [];
  private readonly _alarmas: EventoAlarma[] = [];
  private readonly _escaldados: ResultadoEscaldado[] = [];

  async guardarLectura(lectura: LecturaTelemetria): Promise<void> {
    this._lecturas.push(lectura);
  }

  async guardarEventoAlarma(alarma: EventoAlarma): Promise<void> {
    this._alarmas.push(alarma);
  }

  async guardarResultadoEscaldado(resultado: ResultadoEscaldado): Promise<void> {
    this._escaldados.push(resultado);
  }

  // Métodos de consulta para reportes
  obtenerLecturas(camaraId?: string): LecturaTelemetria[] {
    return camaraId ? this._lecturas.filter((l) => l.camaraId === camaraId) : [...this._lecturas];
  }

  obtenerAlarmas(): EventoAlarma[] {
    return [...this._alarmas];
  }

  obtenerEscaldados(): ResultadoEscaldado[] {
    return [...this._escaldados];
  }
}

// ============================================================
// XI. FÁBRICA DE COMPONENTES (DIP + Composición root)
// ============================================================

/**
 * FabricaSistema1
 * Punto único de composición: ensambla los objetos del sistema.
 * Cambiar de Tecnal a otra marca = cambiar solo esta fábrica.
 */
export class FabricaSistema1 {
  static crearCamaraCompleta(config: ConfiguracionCamara): {
    bucle: BucleControlCamara;
    gestor: GestorAlarmas;
    repositorio: RepositorioMemoria;
    tanque: ControladorTanqueEscaldado;
  } {
    const repositorio = new RepositorioMemoria();
    const gestor = new GestorAlarmas();

    // Registrar observadores
    gestor.suscribir(new ObservadorLogConsola());
    gestor.suscribir(new ObservadorPersistenciaAlarma(repositorio));

    // En producción, descomentarías:
    // gestor.suscribir(new ObservadorNotificacionRemota("https://api.iiap.gob.pe/alertas"));

    // Hardware Tecnal (sustituible por OtroProveedor sin tocar el bucle)
    const termometro = new TermometroTecnal(`TERM-${config.camaraId}`, "/dev/ttyUSB0", 0x01);
    const higrometro = new HigrometroTecnal(`HIG-${config.camaraId}`, "/dev/i2c-1", 0x40);
    const extractor = new ExtractorTecnal(`EXT-${config.camaraId}`, 17);
    const calefactor = new CalefactorTecnal(`CAL-${config.camaraId}`, 27);

    const bucle = new BucleControlCamara(
      config,
      termometro,
      higrometro,
      extractor,
      calefactor,
      gestor,
      repositorio
    );

    const termometroTanque = new TermometroTecnal("TERM-TANQUE-ESC", "/dev/ttyUSB1", 0x02);
    const tanque = new ControladorTanqueEscaldado(termometroTanque, repositorio);

    return { bucle, gestor, repositorio, tanque };
  }
}

// ============================================================
// XII. PUNTO DE ENTRADA / DEMOSTRACIÓN
// ============================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("IIAP 2026 – Chocó Vanilla Tech | Sistema 1 – Iniciando");
  console.log("=".repeat(60));

  const config: ConfiguracionCamara = {
    camaraId: "CAM-001",
    marca: "Tecnal",
    modelo: "TE-4000",
    ubicacion: "Nave A – Chocó",
  };

  const { bucle, gestor, tanque } = FabricaSistema1.crearCamaraCompleta(config);

  // Iniciar monitoreo de cámara
  bucle.iniciar();

  // Ejemplo de reconocimiento de alarma por operario
  setTimeout(() => {
    const alarmasActivas = gestor.obtenerAlarmasActivas();
    if (alarmasActivas.length > 0) {
      console.log(`\n[OPERARIO] Reconociendo ${alarmasActivas.length} alarma(s) activa(s)...`);
      for (const alarma of alarmasActivas) {
        gestor.acknowledgeAlarma(alarma.alarmaId, "OPERARIO-001");
      }
    }
  }, 15_000);

  // Ejemplo de ciclo de escaldado después de 20s
  setTimeout(async () => {
    console.log("\n[MAIN] Iniciando ciclo de escaldado de prueba...");
    const resultado = await tanque.iniciarCiclo(REGLAS_NEGOCIO.DURACION_ESCALDADO_MS);
    console.log("[MAIN] Resultado escaldado:", {
      exitoso: resultado.exitoso,
      tempPromedio: resultado.temperaturaPromedio.toFixed(2),
      duracionS: (resultado.duracionRealMs / 1000).toFixed(0),
    });
  }, 20_000);

  // Detener el sistema limpiamente después de 60s en este demo
  setTimeout(async () => {
    console.log("\n[MAIN] Deteniendo sistema...");
    await bucle.detener();
    process.exit(0);
  }, 60_000);
}

main().catch(console.error);
