# Smart Time Control (STC) — Documentación del Proyecto

---

## 1. Nombre del Proyecto

**Smart Time Control (STC)**  
Nombre comercial del repositorio: `smart-shift-pro`

---

## 2. Descripción

Smart Time Control es una aplicación web de gestión de fuerza laboral (Workforce Management) y control de jornada orientada a empresas colombianas. Combina en una sola plataforma la planificación de turnos, el registro de asistencia en tiempo real y el análisis de nómina, con soporte para múltiples organizaciones y un modelo de permisos por roles.

La aplicación está construida con **TanStack Start** (React 19 + TypeScript), base de datos **Supabase** (PostgreSQL) y una interfaz moderna con **Tailwind CSS + Radix UI**. El despliegue objetivo es Cloudflare Workers.

---

## 3. Objetivo General

Digitalizar y automatizar el ciclo completo de gestión de personal operativo: desde la programación de horarios hasta el control de entrada/salida diaria, pasando por la gestión de ausencias y la generación de reportes de horas trabajadas, con cumplimiento de la legislación laboral colombiana (festivos Ley Emiliani, recargos nocturnos, dominicales, horas extra).

---

## 4. Objetivos Específicos

- Reducir el tiempo de programación de turnos mediante generación automática basada en reglas de cobertura mínima.
- Garantizar trazabilidad completa de entradas, salidas, pausas y novedades de cada empleado.
- Centralizar la aprobación de ausencias y permisos con flujo de estados (pendiente → aprobado/rechazado).
- Proveer dashboards ejecutivos con KPIs de asistencia, horas extras y costos estimados.
- Soportar múltiples organizaciones (multi-tenancy) con aislamiento de datos por organización.

---

## 5. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework UI | TanStack Start (React 19 + TypeScript) |
| Enrutamiento | TanStack Router (file-based) |
| Estado global | Zustand |
| Backend / Base de datos | Supabase (PostgreSQL + Auth + Storage) |
| ORM / Queries | Supabase JS SDK + React Query |
| Estilos | Tailwind CSS 4.2 + Radix UI + shadcn/ui |
| Gráficas | Recharts |
| Formularios | React Hook Form + Zod |
| Notificaciones | Sonner (toasts) |
| Íconos | Lucide React |
| Build | Vite 7 |
| Testing | Vitest |
| Despliegue | Cloudflare Workers |

---

## 6. Arquitectura General

```
smart-shift-pro-main/
├── src/
│   ├── routes/               # Páginas (file-based routing)
│   │   ├── _authenticated/   # Rutas protegidas
│   │   └── auth.*            # Flujo de autenticación
│   ├── lib/
│   │   ├── auth.tsx          # AuthContext + RBAC
│   │   ├── wfm/              # Módulo Workforce Management
│   │   └── jornada/          # Módulo Control de Jornada
│   ├── components/
│   │   ├── ui/               # Primitivos shadcn/ui (~40 componentes)
│   │   └── wfm/              # Sidebar, Topbar, NotificationCenter
│   └── hooks/                # Hooks reutilizables
├── Migration/                # Scripts SQL y seeds Supabase
└── DOCUMENTACION.md
```

---

## 7. Funcionalidades

### 7.1 Autenticación y Autorización

- Registro e inicio de sesión con email/contraseña y Google OAuth (Supabase Auth).
- Restablecimiento de contraseña por correo electrónico.
- **Control de acceso basado en roles (RBAC)** con 5 roles predefinidos:

| Rol | Alcance |
|---|---|
| `admin` | Acceso total: configuración, datos, roles, reportes |
| `supervisor` | Edición de turnos, empleados y ausencias en todas las áreas |
| `lider` | Edición de turnos y ausencias limitada a su propia área |
| `gestor` | Edición de turnos, solo lectura de ausencias y reportes |
| `consulta` | Solo lectura en todas las secciones |

- Límites granulares por rol: `restrictToOwnArea`, `canGenerateShifts`, `canApproveAbsences`, `canExportReports`, `canManageRoles`, `canDeleteData`.
- Soporte **multi-tenancy**: usuarios vinculados a múltiples organizaciones con cambio de contexto en tiempo real.
- Pantalla de aprobación pendiente para nuevos usuarios sin rol asignado.

---

### 7.2 Dashboard Ejecutivo (`/`)

- KPIs en tiempo real: empleados activos, horas programadas de la semana, horas extra acumuladas y ausencias registradas.
- Gráfico de barras con carga diaria de horas de la semana actual.
- Gráfico de torta con distribución de empleados por área.
- Alertas automáticas de subcobertura y sobrecarga por área.
- Resumen de ausencias recientes con estado de aprobación.
- Acciones rápidas contextuales según el rol del usuario.

---

### 7.3 Programación de Turnos — Scheduler (`/scheduler`)

- **Vista semanal y mensual** del calendario de turnos por área y empleado.
- **Generación automática de turnos** basada en reglas de cobertura mínima configuradas por área.
- Asignación manual de turno por celda (empleado × día) con selector de código de novedad.
- **Códigos de novedad** soportados (cumplimiento normativo colombiano):
  - `STD` — Hora estándar diurna
  - `HED` — Hora extra diurna
  - `HEN` — Hora extra nocturna
  - `HEDF` — Hora extra diurna festivo
  - `HENF` — Hora extra nocturna festivo
  - `RN` — Descanso dominical
  - `RDF` — Descanso dominical festivo
  - `RNF` — Descanso nocturno festivo
  - `ABS` — Ausencia
  - `OFF` — Día libre
- **Bloqueo y desbloqueo de semanas** para cierre de planillas.
- **Intercambio de turnos** (swap) entre dos empleados de la misma área.
- Cálculo automático de horas por tipo para cada turno (incluye festivos colombianos — Ley Emiliani y Pascua).
- Filtros por área, semana y estado de bloqueo.

---

### 7.4 Gestión de Empleados (`/employees`)

- CRUD completo de empleados: nombre, documento, cargo, área, tipo de contrato.
- Estados: activo / inactivo.
- Filtro y búsqueda por área, estado y nombre.
- Vinculación del empleado con un usuario de la plataforma (para acceso a Mi Horario).
- Definición de disponibilidad semanal por empleado.

---

### 7.5 Gestión de Áreas (`/areas`)

- CRUD de áreas operativas con configuración propia:
  - Horario de operación (hora inicio / hora fin).
  - Cobertura mínima requerida por franja horaria.
  - Política de horas extra y descansos.
- Vista de tarjetas con estadísticas de cada área (empleados asignados, cobertura actual).

---

### 7.6 Gestión de Ausencias (`/absences`)

- Registro de solicitudes de ausencia con 6 tipos: vacaciones, licencia médica, permiso remunerado, permiso no remunerado, calamidad, otro.
- Flujo de aprobación: `pendiente → aprobado / rechazado`.
- Filtros por empleado, tipo, estado y rango de fechas.
- Integración con el scheduler: las ausencias aprobadas bloquean la celda correspondiente en el calendario.

---

### 7.7 Control de Jornada (`/jornada`)

Módulo de registro de asistencia en tiempo real, con 6 pestañas:

| Pestaña | Función |
|---|---|
| **Dashboard** | KPIs del día: empleados activos, puntualidad, horas trabajadas |
| **Registro** | Marcar entrada, pausa, almuerzo y salida con validación de estado |
| **Horarios** | Plantillas de horario asignadas a cada empleado |
| **Historial** | Log de movimientos con filtros y auditoría de modificaciones |
| **Reportes** | Análisis de puntualidad, horas extra y ausencias del período |
| **Configuración** | Reglas por área: cupos de pausa/almuerzo, tolerancias, alertas |

**Máquina de estados por empleado:**
```
pendiente → en_jornada → en_pausa → en_almuerzo → fuera_de_jornada
```

- Detección automática de llegadas tardías según horario asignado.
- Control de cupos de pausa y almuerzo por área (evita que varios empleados salgan simultáneamente).
- Registro de modificaciones con trazabilidad completa (quién modificó, cuándo y por qué).

---

### 7.8 Mi Horario (`/mi-horario`)

- Vista personal del empleado autenticado con sus turnos de la semana.
- Solo lectura; no requiere rol de supervisor.
- Diseño simplificado para acceso desde dispositivos móviles.

---

### 7.9 Reportes y Analítica (`/reports`)

- Resumen de horas por empleado y por área en el período seleccionado.
- Desglose por tipo de hora: estándar, extra diurna, extra nocturna, festivo.
- Estimación de costo por empleado según horas y tipo.
- Gráficos de tendencia semanal y mensual.
- Exportación de datos (según permiso `canExportReports`).

---

### 7.10 Configuración y Administración (`/settings`)

- **Gestión de usuarios:** cambio de rol, activación/desactivación, restablecimiento de contraseña.
- **Gestión de roles:** crear y editar roles personalizados con la matriz de permisos y límites.
- **Cambio de organización:** contexto multi-tenancy desde el sidebar.
- **Seeds y mantenimiento:** scripts de carga de datos demo y aplicación de migraciones.
- **Centro de notificaciones:** alertas internas sobre cambios de turno, ausencias y cobertura.

---

## 8. Base de Datos (Supabase PostgreSQL)

### Módulo Auth / Multi-tenancy
| Tabla | Descripción |
|---|---|
| `user_profiles` | Perfil extendido del usuario (nombre, área, estado) |
| `roles` | Definición de roles con permisos JSON |
| `user_roles` | Asignación usuario → rol |
| `organizations` | Organizaciones registradas |
| `user_organizations` | Vinculación usuario → organización |

### Módulo WFM
| Tabla | Descripción |
|---|---|
| `areas` | Áreas operativas con reglas de cobertura |
| `employees` | Empleados con disponibilidad y contrato |
| `shifts` | Turnos individuales (fecha, inicio, fin, código, bloqueo) |
| `absences` | Solicitudes de ausencia con estado de aprobación |

### Módulo Jornada
| Tabla | Descripción |
|---|---|
| `jornada_registros` | Movimientos de entrada/salida/pausa |
| `jornada_horarios` | Plantillas de horario por empleado |
| `jornada_cupos` | Cupos de pausa/almuerzo por área |
| `jornada_configuracion` | Reglas de jornada por organización/área |

---

## 9. Flujo Principal de Usuario

```
Login (auth/login)
    ↓
Dashboard (/)                    ← KPIs y resumen
    ├── /scheduler               ← Programar y generar turnos
    ├── /employees               ← Gestionar personal
    ├── /areas                   ← Configurar áreas
    ├── /absences                ← Gestionar ausencias
    ├── /jornada                 ← Control de asistencia diaria
    ├── /mi-horario              ← Vista personal del empleado
    ├── /reports                 ← Analítica y exportación
    └── /settings                ← Admin: usuarios, roles, datos
```

---

## 10. Consideraciones de Cumplimiento Legal (Colombia)

- Cálculo de **festivos colombianos** mediante regla de la Ley Emiliani y algoritmo de Pascua.
- Clasificación automática de horas según Código Sustantivo del Trabajo:
  - Hora diurna: 6:00–22:00
  - Hora nocturna: 22:00–6:00
  - Recargos por dominical y festivo
- Gestión de tipos de ausencia alineados con la normativa laboral colombiana.

---

*Documentación generada el 2026-06-09*