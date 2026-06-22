# IIAP 2026 — Chocó Vanilla Tech
## Sistema 1: Control Industrial y Automatización de Cámaras Climáticas

> Sistema ciberfísico de monitoreo y control autónomo para el proceso de curado y escaldado de vainilla en la región del Chocó, Colombia. Diseñado para operar bajo condiciones de humedad ambiente persistente >90%.

---

## Índice

1. [Contexto del Proyecto](#contexto-del-proyecto)
2. [Reglas de Negocio Críticas](#reglas-de-negocio-críticas)
3. [Arquitectura](#arquitectura)
4. [Estructura de Archivos](#estructura-de-archivos)
5. [Instalación y Ejecución](#instalación-y-ejecución)
6. [Módulos del Sistema](#módulos-del-sistema)
7. [Interfaces de Hardware](#interfaces-de-hardware)
8. [Patrón Observer — Gestión de Alarmas](#patrón-observer--gestión-de-alarmas)
9. [Panel Web del Operario](#panel-web-del-operario)
10. [Soporte Multimarca](#soporte-multimarca)
11. [Extensión del Sistema](#extensión-del-sistema)
12. [Variables de Entorno](#variables-de-entorno)
13. [Equipo](#equipo)

---

## Contexto del Proyecto

El Proyecto IIAP 2026 desarrolla tecnología de automatización para el procesamiento postcosecha de vainilla (*Vanilla planifolia*) en el departamento del Chocó. La región presenta condiciones extremas de humedad (HR ambiente >90%) que generan proliferación de hongos y moho en las cámaras de curado, comprometiendo la calidad del producto.

Este sistema resuelve ese problema de forma autónoma: monitorea temperatura y humedad en tiempo real, activa extractores cuando la humedad supera el umbral crítico, y gestiona el proceso de escaldado (choque térmico) con control estricto de temperatura y temporizado.

---

## Reglas de Negocio Críticas

Estas reglas están codificadas en la constante `REGLAS_NEGOCIO` y **no pueden ser modificadas sin validación del equipo técnico IIAP**.

| Parámetro | Valor | Justificación |
|---|---|---|
| Temperatura escaldado mínima | **63 °C** | Límite inferior zona segura — choque térmico insuficiente |
| Temperatura escaldado máxima | **65 °C** | Límite superior zona segura — daño al tejido vegetal |
| Duración escaldado | **3 minutos ininterrumpidos** | El contador se reinicia si la temperatura sale del rango |
| Umbral HR crítico | **75%** | Activa extractores y dispara alarma de nivel CRÍTICO |
| Humedad objetivo curado | **65%** | El extractor se apaga al bajar a este nivel |
| Temperatura objetivo cámara | **28 °C ± 1 °C** | Histéresis de 1 °C para control del calefactor |
| Intervalo bucle de control | **5 s** | Frecuencia de muestreo y evaluación de reglas |

---

## Arquitectura

El sistema sigue los cinco principios SOLID de forma estricta:

**S — Responsabilidad Única:** El `BucleControlCamara` solo evalúa reglas y actúa sobre actuadores. La persistencia la maneja `IRepositorioTelemetria`. Las notificaciones las manejan los observadores.

**O — Abierto/Cerrado:** Añadir un nuevo canal de alerta (SMS, MQTT, email) implica únicamente crear una clase que implemente `IObservadorAlarma` y suscribirla al `GestorAlarmas`. El motor de control no se modifica.

**L — Sustitución de Liskov:** `TermometroTecnal`, `HigrometroTecnal`, `ExtractorTecnal` y `CalefactorTecnal` pueden ser reemplazados por drivers de cualquier otra marca. El `BucleControlCamara` no nota la diferencia porque solo conoce las interfaces abstractas.

**I — Segregación de Interfaces:** Las interfaces son atómicas: `ITermometro` solo lee temperatura, `IHigrometro` solo lee humedad. No existe una interfaz "ISensorUniversal" con responsabilidades mezcladas.

**D — Inversión de Dependencias:** El `BucleControlCamara` recibe todos sus colaboradores por constructor (inyección de dependencias). No instancia nunca un driver concreto directamente.

```
┌─────────────────────────────────────────────────────┐
│                   FabricaSistema1                   │  ← Composición Root
│              (único lugar que conoce                │
│               los drivers concretos)                │
└────────┬───────────────────────┬────────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐   ┌──────────────────────────────┐
│  BucleControl   │   │  ControladorTanqueEscaldado  │
│    Camara       │   │  (choque térmico 63–65°C)    │
│                 │   └──────────────────────────────┘
│  usa vía DIP:   │
│  ITermometro    │   ┌──────────────────────────────┐
│  IHigrometro    │──▶│        GestorAlarmas         │
│  IActuador*     │   │     (Patrón Observer)        │
│  IGestor        │   │                              │
│  IRepositorio   │   │  ┌──────────────────────┐   │
└─────────────────┘   │  │ ObservadorLog        │   │
                       │  │ ObservadorPersist.   │   │
         ▲             │  │ ObservadorWebhook    │   │
         │             │  └──────────────────────┘   │
┌────────┴────────┐   └──────────────────────────────┘
│ Drivers Tecnal  │
│ (implementan    │
│  interfaces)    │
└─────────────────┘
```

---

## Estructura de Archivos

```
iiap2026-sistema1/
├── sistema1-core.ts          # Core del backend — TypeScript tipado
├── panel-operario-iiap2026.html  # Interfaz web standalone del operario
└── README.md                 # Este archivo
```

Para un proyecto de producción completo se recomienda:

```
iiap2026-sistema1/
├── src/
│   ├── domain/
│   │   ├── types.ts           # Tipos Celsius, PorcentajeHR, enums
│   │   ├── constants.ts       # REGLAS_NEGOCIO
│   │   └── interfaces.ts      # ITermometro, IHigrometro, etc.
│   ├── hardware/
│   │   ├── tecnal/
│   │   │   ├── TermometroTecnal.ts
│   │   │   ├── HigrometroTecnal.ts
│   │   │   ├── ExtractorTecnal.ts
│   │   │   └── CalefactorTecnal.ts
│   │   └── otra-marca/        # Se añade sin modificar el core
│   ├── control/
│   │   ├── BucleControlCamara.ts
│   │   └── ControladorTanqueEscaldado.ts
│   ├── alarmas/
│   │   ├── GestorAlarmas.ts
│   │   ├── ObservadorLogConsola.ts
│   │   ├── ObservadorPersistencia.ts
│   │   └── ObservadorNotificacionRemota.ts
│   ├── persistence/
│   │   ├── IRepositorioTelemetria.ts
│   │   └── RepositorioMemoria.ts  # Reemplazar por Postgres/InfluxDB
│   └── factory/
│       └── FabricaSistema1.ts
├── web/
│   └── panel-operario-iiap2026.html
├── tests/
│   └── escaldado.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Instalación y Ejecución

### Requisitos

- Node.js 20 o superior
- TypeScript 5.x
- Acceso a puertos seriales `/dev/ttyUSB*` (para drivers Tecnal en hardware real)
- Acceso a bus I2C `/dev/i2c-*` (para sensores de humedad)

### Instalación

```bash
npm init -y
npm install typescript ts-node @types/node
npx tsc --init
```

Configuración mínima recomendada para `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "outDir": "./dist"
  }
}
```

### Ejecución en desarrollo

```bash
npx ts-node sistema1-core.ts
```

### Compilación para producción

```bash
npx tsc
node dist/sistema1-core.js
```

### Panel web del operario

Abrir directamente en navegador — no requiere servidor:

```bash
open panel-operario-iiap2026.html
# o en Linux:
xdg-open panel-operario-iiap2026.html
```

---

## Módulos del Sistema

### `ControladorTanqueEscaldado`

Gestiona el proceso de choque térmico. El método `iniciarCiclo()` implementa la regla crítica: el temporizador de 3 minutos **se reinicia** cada vez que la temperatura sale del rango 63–65 °C. Solo se contabiliza el tiempo con temperatura dentro del rango.

```typescript
const resultado = await tanque.iniciarCiclo(REGLAS_NEGOCIO.DURACION_ESCALDADO_MS);
// resultado.exitoso === true solo si se completaron 3 min continuos en zona
```

El método retorna un `ResultadoEscaldado` completo con temperatura mínima, máxima, promedio y todas las muestras para trazabilidad del lote.

### `BucleControlCamara`

Motor de control periódico. Llama `iniciar()` una vez; se ejecuta indefinidamente hasta `detener()`. Al detenerse, apaga todos los actuadores como medida de seguridad.

```typescript
const { bucle } = FabricaSistema1.crearCamaraCompleta(config);
bucle.iniciar();

// Detención limpia (apaga calefactor y extractor)
await bucle.detener();
```

### `GestorAlarmas`

Implementa el patrón Observer. Las alarmas emitidas permanecen activas hasta que un operario las reconozca explícitamente con `acknowledgeAlarma()`.

```typescript
gestor.acknowledgeAlarma(alarmaId, "OPERARIO-001");
// Registra quién reconoció, cuándo, y marca la alarma como reconocida
```

---

## Interfaces de Hardware

Para integrar una marca de hardware nueva, implementar las interfaces y registrarlas en `FabricaSistema1`:

```typescript
// Ejemplo: sensor marca OtraMarca
class TermometroOtraMarca implements ITermometro {
  readonly sensorId = "TERM-OTRA-001";

  async leerTemperatura(): Promise<Celsius> {
    // Protocolo propio de OtraMarca
    const raw = await otraMarcaSDK.read();
    return raw.tempCelsius;
  }
}

// En FabricaSistema1:
const termometro = new TermometroOtraMarca();
// El BucleControlCamara no cambia en absoluto
```

---

## Patrón Observer — Gestión de Alarmas

El `GestorAlarmas` es el Subject. Los observadores se suscriben y reciben notificaciones en tiempo real:

```typescript
// Observador personalizado — ejemplo: enviar a Telegram
class ObservadorTelegram implements IObservadorAlarma {
  readonly observadorId = "obs-telegram";

  notificar(alarma: EventoAlarma): void {
    if (alarma.nivel !== NivelAlarma.CRITICO) return;
    telegram.sendMessage(`🚨 ${alarma.mensaje}`);
  }
}

gestor.suscribir(new ObservadorTelegram());
// Desde este momento recibe todas las alarmas críticas automáticamente
```

Los niveles de alarma disponibles son `INFORMATIVO`, `ADVERTENCIA` y `CRITICO`. Solo las alarmas `CRITICO` disparan el extractor de forma autónoma.

---

## Panel Web del Operario

El archivo `panel-operario-iiap2026.html` es un documento standalone que no requiere framework, servidor ni dependencias instaladas. Carga Tailwind CSS desde CDN.

**Funcionalidades:**

- Gauges circulares animados de temperatura y humedad con cambio de color por estado
- Alerta roja parpadeante cuando la HR supera el 75%, con extractor visible activado
- Botón de Confirmar Alerta (ACK) con registro de timestamp
- Simulador de escaldado con conteo regresivo en tiempo real, barra de progreso y gráfica canvas del tanque
- Reinicio automático del contador si la temperatura sale del rango 63–65 °C
- Mini gráfica histórico de los últimos 60 segundos con línea de umbral
- Log de eventos en tiempo real con colores por severidad

**Paleta visual:**

| Token | Hex | Uso |
|---|---|---|
| Gris base | `#0f1117` | Fondo principal |
| Gris panel | `#1e2433` | Tarjetas |
| Verde selva | `#1a5c2e` | Botón primario, elementos OK |
| Verde acento | `#3dba6a` | Valores nominales, zona segura |
| Rojo alerta | `#e53e3e` | Alarmas críticas, parpadeo |
| Ámbar | `#f6ad55` | Temperatura tanque, advertencias |
| Azul info | `#63b3ed` | Humedad, información |

---

## Soporte Multimarca

La arquitectura permite integrar cámaras climáticas de cualquier fabricante (Tecnal, Memmert, Binder, Climavent, etc.) implementando únicamente las cuatro interfaces atómicas y actualizando la `FabricaSistema1`. El `BucleControlCamara` y todas las reglas de negocio permanecen sin cambios.

```
Nueva marca → implementa 4 interfaces → registra en FábricaSistema1 → listo
```

No se requiere modificar ningún otro módulo del sistema.

---

## Variables de Entorno

Para producción, externalizar la configuración de hardware en variables de entorno:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PUERTO_SERIAL_TEMP` | Puerto del termómetro Modbus | `/dev/ttyUSB0` |
| `DIR_MODBUS_TEMP` | Dirección Modbus del sensor | `1` |
| `PUERTO_I2C_HIG` | Bus I2C del higrómetro | `/dev/i2c-1` |
| `DIR_I2C_HIG` | Dirección I2C del sensor | `0x40` |
| `PIN_RELE_EXTRACTOR` | Pin GPIO del relé del extractor | `17` |
| `PIN_RELE_CALEFACTOR` | Pin GPIO del relé del calefactor | `27` |
| `WEBHOOK_ALERTAS` | URL para notificaciones remotas | `https://api.iiap.gob.pe/alertas` |
| `INTERVALO_BUCLE_MS` | Frecuencia del bucle de control | `5000` |

---

## Equipo

**Proyecto:** IIAP 2026 — Chocó Vanilla Tech  
**Sistema:** 1 — Control Industrial y Automatización de Cámaras Climáticas  
**Región:** Departamento del Chocó, Colombia  
**Versión:** 1.0.0  
**Arquitectura:** SOLID · TypeScript · IoT · Patrón Observer · Inyección de Dependencias
