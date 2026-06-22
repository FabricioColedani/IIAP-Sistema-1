"use strict";
/**
 * IIAP 2026 – Chocó Vanilla Tech
 * Sistema 1: Control Industrial y Automatización de Cámaras Climáticas
 *
 * Arquitectura SOLID completa con inyección de dependencias,
 * patrón Observer para alertas y control concurrente.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FabricaSistema1 = exports.RepositorioMemoria = exports.BucleControlCamara = exports.ObservadorNotificacionRemota = exports.ObservadorPersistenciaAlarma = exports.ObservadorLogConsola = exports.GestorAlarmas = exports.ControladorTanqueEscaldado = exports.CalefactorTecnal = exports.ExtractorTecnal = exports.HigrometroTecnal = exports.TermometroTecnal = exports.REGLAS_NEGOCIO = exports.EstadoEscaldado = exports.NivelAlarma = exports.EstadoCalefactor = exports.EstadoExtractor = void 0;
var EstadoExtractor;
(function (EstadoExtractor) {
    EstadoExtractor["APAGADO"] = "APAGADO";
    EstadoExtractor["ENCENDIDO"] = "ENCENDIDO";
})(EstadoExtractor || (exports.EstadoExtractor = EstadoExtractor = {}));
var EstadoCalefactor;
(function (EstadoCalefactor) {
    EstadoCalefactor["APAGADO"] = "APAGADO";
    EstadoCalefactor["ENCENDIDO"] = "ENCENDIDO";
})(EstadoCalefactor || (exports.EstadoCalefactor = EstadoCalefactor = {}));
var NivelAlarma;
(function (NivelAlarma) {
    NivelAlarma["INFORMATIVO"] = "INFORMATIVO";
    NivelAlarma["ADVERTENCIA"] = "ADVERTENCIA";
    NivelAlarma["CRITICO"] = "CRITICO";
})(NivelAlarma || (exports.NivelAlarma = NivelAlarma = {}));
var EstadoEscaldado;
(function (EstadoEscaldado) {
    EstadoEscaldado["INACTIVO"] = "INACTIVO";
    EstadoEscaldado["CALENTANDO"] = "CALENTANDO";
    EstadoEscaldado["ZONA_SEGURA"] = "ZONA_SEGURA";
    EstadoEscaldado["FUERA_DE_RANGO"] = "FUERA_DE_RANGO";
    EstadoEscaldado["COMPLETADO"] = "COMPLETADO";
    EstadoEscaldado["ABORTADO"] = "ABORTADO";
})(EstadoEscaldado || (exports.EstadoEscaldado = EstadoEscaldado = {}));
// ============================================================
// IV. CONSTANTES DE NEGOCIO (REGLAS GEOGRÁFICAS CHOCÓ)
// ============================================================
exports.REGLAS_NEGOCIO = {
    /** Límite inferior de la zona segura de escaldado (°C) */
    TEMP_ESCALDADO_MIN: 63,
    /** Límite superior de la zona segura de escaldado (°C) */
    TEMP_ESCALDADO_MAX: 65,
    /** Duración exacta del proceso de escaldado (3 min en ms) */
    DURACION_ESCALDADO_MS: 3 * 60 * 1000,
    /** Umbral crítico de Humedad Relativa – región Chocó (>90% ambiente) */
    UMBRAL_HUMEDAD_CRITICA_PCT: 75,
    /** Humedad objetivo para las cámaras de curado */
    HUMEDAD_OBJETIVO_PCT: 65,
    /** Temperatura objetivo para cámaras de curado */
    TEMP_CAMARA_OBJETIVO_C: 28,
    /** Intervalo del bucle de control (ms) */
    INTERVALO_BUCLE_MS: 5_000,
    /** Tolerancia de temperatura para apagar calefactor (histéresis) */
    HISTERESIS_TEMP_C: 1,
};
// ============================================================
// V. DRIVERS DE HARDWARE – IMPLEMENTACIONES TECNAL (LSP)
// ============================================================
// Estos drivers implementan las interfaces atómicas.
// Sustituibles por cualquier otra marca sin cambiar el bucle de control.
class TermometroTecnal {
    sensorId;
    puertoSerial;
    direccionModbus;
    _ultimaLectura = 22.0;
    constructor(sensorId, puertoSerial, direccionModbus) {
        this.sensorId = sensorId;
        this.puertoSerial = puertoSerial;
        this.direccionModbus = direccionModbus;
    }
    /**
     * En producción: lectura Modbus RTU sobre RS-485.
     * Simulación inyectable para tests.
     */
    async leerTemperatura() {
        // Producción: comunicación Modbus real
        // const registro = await modbusClient.readInputRegisters(this.direccionModbus, 1);
        // return registro.data[0] / 10;
        // Simulación determinista para entorno de pruebas
        const variacion = (Math.random() - 0.5) * 0.8;
        this._ultimaLectura = Math.max(15, Math.min(80, this._ultimaLectura + variacion));
        return parseFloat(this._ultimaLectura.toFixed(1));
    }
}
exports.TermometroTecnal = TermometroTecnal;
class HigrometroTecnal {
    sensorId;
    puertoI2C;
    direccionI2C;
    _ultimaLectura = 68.0;
    constructor(sensorId, puertoI2C, direccionI2C) {
        this.sensorId = sensorId;
        this.puertoI2C = puertoI2C;
        this.direccionI2C = direccionI2C;
    }
    async leerHumedadRelativa() {
        // Producción: protocolo I2C / SHT31 / HTU21D
        // const rawData = await i2cBus.readI2cBlock(this.direccionI2C, 0xE0, 6, Buffer.alloc(6));
        // return calcularHumedad(rawData);
        const variacion = (Math.random() - 0.5) * 2;
        this._ultimaLectura = Math.max(30, Math.min(99, this._ultimaLectura + variacion));
        return parseFloat(this._ultimaLectura.toFixed(1));
    }
}
exports.HigrometroTecnal = HigrometroTecnal;
class ExtractorTecnal {
    actuadorId;
    pinRelé;
    logFn;
    _estado = EstadoExtractor.APAGADO;
    constructor(actuadorId, pinRelé, logFn = console.log) {
        this.actuadorId = actuadorId;
        this.pinRelé = pinRelé;
        this.logFn = logFn;
    }
    async encender() {
        if (this._estado === EstadoExtractor.ENCENDIDO)
            return;
        // Producción: GPIO.write(this.pinRelé, 1);
        this._estado = EstadoExtractor.ENCENDIDO;
        this.logFn(`[${this.actuadorId}] Extractor ENCENDIDO (pin ${this.pinRelé})`);
    }
    async apagar() {
        if (this._estado === EstadoExtractor.APAGADO)
            return;
        // Producción: GPIO.write(this.pinRelé, 0);
        this._estado = EstadoExtractor.APAGADO;
        this.logFn(`[${this.actuadorId}] Extractor APAGADO (pin ${this.pinRelé})`);
    }
    obtenerEstado() {
        return this._estado;
    }
}
exports.ExtractorTecnal = ExtractorTecnal;
class CalefactorTecnal {
    actuadorId;
    pinRelé;
    logFn;
    _estado = EstadoCalefactor.APAGADO;
    constructor(actuadorId, pinRelé, logFn = console.log) {
        this.actuadorId = actuadorId;
        this.pinRelé = pinRelé;
        this.logFn = logFn;
    }
    async encender() {
        if (this._estado === EstadoCalefactor.ENCENDIDO)
            return;
        this._estado = EstadoCalefactor.ENCENDIDO;
        this.logFn(`[${this.actuadorId}] Calefactor ENCENDIDO (pin ${this.pinRelé})`);
    }
    async apagar() {
        if (this._estado === EstadoCalefactor.APAGADO)
            return;
        this._estado = EstadoCalefactor.APAGADO;
        this.logFn(`[${this.actuadorId}] Calefactor APAGADO (pin ${this.pinRelé})`);
    }
    obtenerEstado() {
        return this._estado;
    }
}
exports.CalefactorTecnal = CalefactorTecnal;
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
class ControladorTanqueEscaldado {
    termometro;
    repositorio;
    logFn;
    _estado = EstadoEscaldado.INACTIVO;
    _abortarCiclo = false;
    INTERVALO_MUESTREO_MS = 2_000;
    constructor(termometro, repositorio, logFn = console.log) {
        this.termometro = termometro;
        this.repositorio = repositorio;
        this.logFn = logFn;
    }
    obtenerEstado() {
        return this._estado;
    }
    async obtenerTemperaturaActual() {
        return this.termometro.leerTemperatura();
    }
    async abortar() {
        this._abortarCiclo = true;
        this.logFn("[ESCALDADO] Solicitud de aborto recibida.");
    }
    /**
     * Ejecuta un ciclo de escaldado completo.
     * El temporizador de 3 min se REINICIA si la temperatura sale del rango.
     * Retorna el resultado detallado del ciclo para trazabilidad.
     */
    async iniciarCiclo(duracionMs = exports.REGLAS_NEGOCIO.DURACION_ESCALDADO_MS) {
        if (this._estado !== EstadoEscaldado.INACTIVO && this._estado !== EstadoEscaldado.COMPLETADO && this._estado !== EstadoEscaldado.ABORTADO) {
            throw new Error(`No se puede iniciar ciclo: estado actual es ${this._estado}`);
        }
        const cicloId = `ESC-${Date.now()}`;
        const timestampInicio = Date.now();
        this._abortarCiclo = false;
        this._estado = EstadoEscaldado.CALENTANDO;
        const muestras = [];
        let tempMin = Infinity;
        let tempMax = -Infinity;
        let sumaTemp = 0;
        let tiempoEnZonaMs = 0;
        let ultimoTsEnZona = null;
        this.logFn(`[ESCALDADO ${cicloId}] Ciclo iniciado. Objetivo: ${exports.REGLAS_NEGOCIO.TEMP_ESCALDADO_MIN}–${exports.REGLAS_NEGOCIO.TEMP_ESCALDADO_MAX}°C durante ${duracionMs / 60000} min`);
        // Bucle de muestreo hasta completar el tiempo en zona segura
        while (!this._abortarCiclo) {
            const ahora = Date.now();
            const tempActual = await this.termometro.leerTemperatura();
            // Actualizar estadísticas
            muestras.push({ ts: ahora, tempC: tempActual });
            if (tempActual < tempMin)
                tempMin = tempActual;
            if (tempActual > tempMax)
                tempMax = tempActual;
            sumaTemp += tempActual;
            const enZonaSegura = tempActual >= exports.REGLAS_NEGOCIO.TEMP_ESCALDADO_MIN &&
                tempActual <= exports.REGLAS_NEGOCIO.TEMP_ESCALDADO_MAX;
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
                this.logFn(`[ESCALDADO ${cicloId}] 🌡 ${tempActual}°C | ` +
                    `Tiempo en zona: ${(tiempoEnZonaMs / 1000).toFixed(0)}s / ${duracionMs / 1000}s`);
            }
            else {
                // Temperatura fuera del rango – reiniciar el contador de tiempo
                if (this._estado === EstadoEscaldado.ZONA_SEGURA) {
                    this.logFn(`[ESCALDADO ${cicloId}] ⚠️ Temperatura ${tempActual}°C salió del rango. ` +
                        `Contador reiniciado.`);
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
        const resultado = {
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
        this.logFn(`[ESCALDADO ${cicloId}] ${resultado.exitoso ? "✅ COMPLETADO" : "❌ ABORTADO"} | ` +
            `T̄=${resultado.temperaturaPromedio.toFixed(1)}°C | ` +
            `Duración real: ${(resultado.duracionRealMs / 1000).toFixed(0)}s`);
        return resultado;
    }
    _esperar(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.ControladorTanqueEscaldado = ControladorTanqueEscaldado;
// ============================================================
// VII. GESTOR DE ALARMAS CON PATRÓN OBSERVER
// ============================================================
/**
 * GestorAlarmas
 *
 * Mantiene el registro de alarmas activas y notifica a los observadores
 * suscritos. Implementa acknowledgeAlarma() para confirmación manual.
 */
class GestorAlarmas {
    _observadores = new Map();
    _alarmasActivas = new Map();
    suscribir(observador) {
        this._observadores.set(observador.observadorId, observador);
    }
    desuscribir(observadorId) {
        this._observadores.delete(observadorId);
    }
    /**
     * Emite una nueva alarma y notifica a todos los observadores suscritos.
     */
    emitir(alarma) {
        this._alarmasActivas.set(alarma.alarmaId, alarma);
        for (const observador of this._observadores.values()) {
            observador.notificar(alarma);
        }
    }
    /**
     * Confirmación manual de alarma por parte del operario.
     * Una alarma reconocida deja de figurar como activa pendiente.
     */
    acknowledgeAlarma(alarmaId, operarioId) {
        const alarma = this._alarmasActivas.get(alarmaId);
        if (!alarma) {
            throw new Error(`Alarma ${alarmaId} no encontrada o ya fue reconocida.`);
        }
        const alarmaReconocida = {
            ...alarma,
            reconocida: true,
            timestampReconocimiento: Date.now(),
            operarioId,
        };
        this._alarmasActivas.set(alarmaId, alarmaReconocida);
        console.log(`[GestorAlarmas] Alarma ${alarmaId} reconocida por operario ${operarioId} ` +
            `a las ${new Date(alarmaReconocida.timestampReconocimiento).toISOString()}`);
    }
    obtenerAlarmasActivas() {
        return [...this._alarmasActivas.values()].filter((a) => !a.reconocida);
    }
    obtenerTodasLasAlarmas() {
        return [...this._alarmasActivas.values()];
    }
}
exports.GestorAlarmas = GestorAlarmas;
// ============================================================
// VIII. OBSERVADORES CONCRETOS (OCP – extensible sin modificar)
// ============================================================
/** Observador que escribe alarmas en el log de consola */
class ObservadorLogConsola {
    observadorId = "obs-log-consola";
    notificar(alarma) {
        const nivel = alarma.nivel === NivelAlarma.CRITICO ? "🚨" :
            alarma.nivel === NivelAlarma.ADVERTENCIA ? "⚠️" : "ℹ️";
        console.warn(`${nivel} [${alarma.nivel}] Cámara ${alarma.camaraId} | ` +
            `${alarma.mensaje} | Valor: ${alarma.valorMedido} | Umbral: ${alarma.umbral}`);
    }
}
exports.ObservadorLogConsola = ObservadorLogConsola;
/** Observador que persiste alarmas en base de datos (DIP) */
class ObservadorPersistenciaAlarma {
    repositorio;
    observadorId = "obs-persistencia";
    constructor(repositorio) {
        this.repositorio = repositorio;
    }
    notificar(alarma) {
        // Fire-and-forget con manejo de errores
        this.repositorio.guardarEventoAlarma(alarma).catch((err) => {
            console.error("[ObservadorPersistenciaAlarma] Error al persistir:", err);
        });
    }
}
exports.ObservadorPersistenciaAlarma = ObservadorPersistenciaAlarma;
/** Observador que enviaría alerta por canal HTTP/MQTT en producción */
class ObservadorNotificacionRemota {
    endpointWebhook;
    fetchFn;
    observadorId = "obs-notificacion-remota";
    constructor(endpointWebhook, fetchFn = fetch) {
        this.endpointWebhook = endpointWebhook;
        this.fetchFn = fetchFn;
    }
    notificar(alarma) {
        if (alarma.nivel !== NivelAlarma.CRITICO)
            return; // Solo críticos van al webhook
        this.fetchFn(this.endpointWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alarma),
        }).catch((err) => {
            console.error("[ObservadorNotificacionRemota] Fallo webhook:", err);
        });
    }
}
exports.ObservadorNotificacionRemota = ObservadorNotificacionRemota;
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
class BucleControlCamara {
    config;
    termometro;
    higrometro;
    extractor;
    calefactor;
    gestor;
    repositorio;
    logFn;
    _activo = false;
    _intervaloRef = null;
    _contadorIteraciones = 0;
    constructor(config, termometro, higrometro, extractor, calefactor, gestor, repositorio, logFn = console.log) {
        this.config = config;
        this.termometro = termometro;
        this.higrometro = higrometro;
        this.extractor = extractor;
        this.calefactor = calefactor;
        this.gestor = gestor;
        this.repositorio = repositorio;
        this.logFn = logFn;
    }
    /**
     * Inicia el bucle de control periódico.
     * Seguro para llamar múltiples veces (idempotente).
     */
    iniciar() {
        if (this._activo)
            return;
        this._activo = true;
        this._intervaloRef = setInterval(() => this._iteracion().catch((err) => this.logFn(`[BucleControl] Error en iteración: ${err}`)), exports.REGLAS_NEGOCIO.INTERVALO_BUCLE_MS);
        this.logFn(`[BucleControl ${this.config.camaraId}] Bucle iniciado (cada ${exports.REGLAS_NEGOCIO.INTERVALO_BUCLE_MS / 1000}s)`);
    }
    /**
     * Detiene el bucle de control de forma limpia.
     */
    async detener() {
        if (!this._activo)
            return;
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
    async _iteracion() {
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
        const lectura = {
            camaraId: this.config.camaraId,
            timestamp,
            temperaturaC,
            humedadRelativaPct,
            estadoExtractor: this.extractor.obtenerEstado(),
            estadoCalefactor: this.calefactor.obtenerEstado(),
        };
        await this.repositorio.guardarLectura(lectura);
        this.logFn(`[${this.config.camaraId}] it#${this._contadorIteraciones} | ` +
            `T=${temperaturaC}°C | HR=${humedadRelativaPct}% | ` +
            `Ext=${this.extractor.obtenerEstado()} | Cal=${this.calefactor.obtenerEstado()}`);
    }
    /**
     * Evalúa la humedad y activa extractores si supera el umbral crítico.
     * Región Chocó: humedad ambiente >90%, umbral de actuación 75%.
     */
    async _evaluarHumedad(hr, timestamp) {
        if (hr > exports.REGLAS_NEGOCIO.UMBRAL_HUMEDAD_CRITICA_PCT) {
            await this.extractor.encender();
            const alarma = {
                alarmaId: `ALM-HR-${this.config.camaraId}-${timestamp}`,
                camaraId: this.config.camaraId,
                timestamp,
                nivel: NivelAlarma.CRITICO,
                mensaje: `Humedad Relativa CRÍTICA: ${hr}% supera umbral de ${exports.REGLAS_NEGOCIO.UMBRAL_HUMEDAD_CRITICA_PCT}%. Extractor activado. Riesgo de hongos/moho.`,
                valorMedido: hr,
                umbral: exports.REGLAS_NEGOCIO.UMBRAL_HUMEDAD_CRITICA_PCT,
                reconocida: false,
            };
            this.gestor.emitir(alarma);
        }
        else if (hr <= exports.REGLAS_NEGOCIO.HUMEDAD_OBJETIVO_PCT) {
            // HR en zona óptima → apagar extractor (ahorro energético)
            await this.extractor.apagar();
        }
        // Entre 65% y 75%: mantener estado actual del extractor (histéresis)
    }
    /**
     * Evalúa la temperatura y controla el calefactor con histéresis de 1°C.
     */
    async _evaluarTemperatura(temp, timestamp) {
        const objetivo = exports.REGLAS_NEGOCIO.TEMP_CAMARA_OBJETIVO_C;
        const histeresis = exports.REGLAS_NEGOCIO.HISTERESIS_TEMP_C;
        if (temp < objetivo - histeresis) {
            await this.calefactor.encender();
        }
        else if (temp > objetivo + histeresis) {
            await this.calefactor.apagar();
            if (temp > objetivo + 5) {
                const alarma = {
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
exports.BucleControlCamara = BucleControlCamara;
// ============================================================
// X. REPOSITORIO EN MEMORIA (para pruebas / sin base de datos)
// ============================================================
class RepositorioMemoria {
    _lecturas = [];
    _alarmas = [];
    _escaldados = [];
    async guardarLectura(lectura) {
        this._lecturas.push(lectura);
    }
    async guardarEventoAlarma(alarma) {
        this._alarmas.push(alarma);
    }
    async guardarResultadoEscaldado(resultado) {
        this._escaldados.push(resultado);
    }
    // Métodos de consulta para reportes
    obtenerLecturas(camaraId) {
        return camaraId ? this._lecturas.filter((l) => l.camaraId === camaraId) : [...this._lecturas];
    }
    obtenerAlarmas() {
        return [...this._alarmas];
    }
    obtenerEscaldados() {
        return [...this._escaldados];
    }
}
exports.RepositorioMemoria = RepositorioMemoria;
// ============================================================
// XI. FÁBRICA DE COMPONENTES (DIP + Composición root)
// ============================================================
/**
 * FabricaSistema1
 * Punto único de composición: ensambla los objetos del sistema.
 * Cambiar de Tecnal a otra marca = cambiar solo esta fábrica.
 */
class FabricaSistema1 {
    static crearCamaraCompleta(config) {
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
        const bucle = new BucleControlCamara(config, termometro, higrometro, extractor, calefactor, gestor, repositorio);
        const termometroTanque = new TermometroTecnal("TERM-TANQUE-ESC", "/dev/ttyUSB1", 0x02);
        const tanque = new ControladorTanqueEscaldado(termometroTanque, repositorio);
        return { bucle, gestor, repositorio, tanque };
    }
}
exports.FabricaSistema1 = FabricaSistema1;
// ============================================================
// XII. PUNTO DE ENTRADA / DEMOSTRACIÓN
// ============================================================
async function main() {
    console.log("=".repeat(60));
    console.log("IIAP 2026 – Chocó Vanilla Tech | Sistema 1 – Iniciando");
    console.log("=".repeat(60));
    const config = {
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
        const resultado = await tanque.iniciarCiclo(exports.REGLAS_NEGOCIO.DURACION_ESCALDADO_MS);
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
//# sourceMappingURL=sistema1-core.js.map