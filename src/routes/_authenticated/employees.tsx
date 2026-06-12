import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { useAuth } from "@/lib/auth";
import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Pencil, Trash2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { adminListUsers, adminUpdateUser, type AppUser } from "@/lib/auth/admin.server";
import { dispatchEmployeeEvent } from "@/lib/notifications/dispatch";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "Trabajadores · STC" }] }),
  component: EmployeesPage,
});

const DAY_LABELS = [
  { day: 1, label: "L" },
  { day: 2, label: "M" },
  { day: 3, label: "Mi" },
  { day: 4, label: "J" },
  { day: 5, label: "V" },
  { day: 6, label: "S" },
  { day: 0, label: "D" },
];

const CONTRACT_LABELS: Record<string, string> = {
  indefinido: "Término indefinido",
  fijo: "Término fijo",
  obra: "Por prestación",
  aprendiz: "Aprendiz SENA",
};

type StatusFilter = "all" | "active" | "inactive";

function EmployeesPage() {
  const { employees, areas, removeEmployee, upsertEmployee } = useWFM();
  const { hasPermission, hasLimit } = useAuth();
  const canEdit   = hasPermission("employees", "edit");
  const canDelete = hasLimit("canDeleteData");

  const [q, setQ]                         = useState("");
  const [areaFilter, setAreaFilter]       = useState("all");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [editing, setEditing]             = useState<string | null>(null);

  const [users, setUsers] = useState<AppUser[]>([]);
  useEffect(() => { adminListUsers().then(setUsers).catch(() => {}); }, []);
  function reloadUsers() { adminListUsers().then(setUsers).catch(() => {}); }

  const userByEmpId = useMemo(
    () => new Map(users.filter(u => u.employeeId).map(u => [u.employeeId!, u])),
    [users],
  );

  const list = employees.filter(e => {
    const matchQ = !q || e.fullName.toLowerCase().includes(q.toLowerCase()) || e.documentId.includes(q);
    const matchA = areaFilter === "all" || e.areaId === areaFilter;
    const matchS = statusFilter === "all" || e.status === statusFilter;
    return matchQ && matchA && matchS;
  });

  const activeCount = employees.filter(e => e.status === "active").length;

  return (
    <>
      <Topbar
        title="Trabajadores"
        subtitle={`${activeCount} activos`}
        right={
          canEdit ? (
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nuevo trabajador</span>
            </button>
          ) : undefined
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-pill border border-border bg-card px-3.5 py-2 w-full sm:w-72 focus-within:border-primary/40 focus-within:shadow-soft transition-shadow">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o documento..."
              className="bg-transparent text-sm outline-none flex-1"
            />
          </div>

          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="text-sm rounded-pill border border-border bg-card px-3.5 py-2 outline-none"
          >
            <option value="all">Todas las áreas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <div className="flex items-center rounded-pill border border-border bg-card overflow-hidden text-sm">
            {(["all", "active", "inactive"] as const).map((s, i) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-2 transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary"
                } ${i > 0 ? "border-l border-border" : ""}`}
              >
                {s === "all" ? "Todos" : s === "active" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>

          <span className="text-sm text-muted-foreground ml-auto">
            {list.length} trabajador{list.length !== 1 ? "es" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-card border border-border bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Trabajador</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Documento</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Cargo</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Área</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Contrato</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Acceso</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Estado</th>
                  {(canEdit || canDelete) && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {list.map(e => {
                  const initials = e.fullName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                  const areaName = areas.find(a => a.id === e.areaId)?.name ?? "—";
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                            {initials}
                          </div>
                          <span className="font-medium truncate max-w-[160px]">{e.fullName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.documentId}</td>
                      <td className="px-4 py-3">{e.position}</td>
                      <td className="px-4 py-3">{areaName}</td>
                      <td className="px-4 py-3">{CONTRACT_LABELS[e.contractType] ?? e.contractType}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const linked = userByEmpId.get(e.id);
                          return linked ? (
                            <div className="flex items-center gap-1.5">
                              <Link2 className="size-3 text-primary shrink-0" />
                              <span className="text-xs font-medium truncate max-w-[140px]" title={linked.email}>
                                {linked.fullName || linked.email}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Unlink className="size-3 shrink-0" />
                              <span className="text-[11px]">Sin vincular</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-pill px-3 py-1 text-[11px] font-medium tracking-[0.02em] ${
                          e.status === "active"
                            ? "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)] text-[#1F8A5B]"
                            : "bg-secondary text-muted-foreground"
                        }`}>
                          {e.status === "active" ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {(canEdit || canDelete) && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            {canEdit && (
                              <button
                                onClick={() => setEditing(e.id)}
                                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="size-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => removeEmployee(e.id)}
                                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={(canEdit || canDelete) ? 8 : 7} className="text-center py-12 text-muted-foreground">
                      Sin resultados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <EmployeeModal
          employee={editing === "new" ? null : employees.find(e => e.id === editing) ?? null}
          areas={areas}
          users={users}
          onClose={() => setEditing(null)}
          onSave={(emp: any) => {
            const existing = employees.find((e: any) => e.id === emp.id);
            const isNew = !existing;
            const wasActive = existing?.status === "active";
            upsertEmployee(emp);
            setEditing(null);
            reloadUsers();
            if (isNew) {
              dispatchEmployeeEvent({ data: { event: "employee_added", employeeName: emp.fullName } }).catch(e => console.error("[notif:employee]", e?.message ?? e));
            } else if (wasActive && emp.status === "inactive") {
              dispatchEmployeeEvent({ data: { event: "employee_deactivated", employeeName: emp.fullName } }).catch(e => console.error("[notif:employee]", e?.message ?? e));
            } else if (!wasActive && emp.status === "active") {
              dispatchEmployeeEvent({ data: { event: "employee_reactivated", employeeName: emp.fullName } }).catch(e => console.error("[notif:employee]", e?.message ?? e));
            }
          }}
        />
      )}
    </>
  );
}

function EmployeeModal({ employee, areas, users, onClose, onSave }: any) {
  const { employees } = useWFM();
  const currentLinkedUser: AppUser | undefined = users.find((u: AppUser) => u.employeeId === employee?.id);

  const [form, setForm] = useState(() => ({
    ...(employee ?? {
      id: `e${Date.now()}`,
      fullName: "",
      documentId: "",
      position: "",
      areaId: areas[0]?.id ?? "",
      leader: areas[0]?.leader ?? "",
      status: "active" as const,
      contractType: "indefinido" as const,
      hireDate: new Date().toISOString().slice(0, 10),
      availability: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, { start: 8, end: 18 }])),
    }),
    linkedUserId: currentLinkedUser?.id ?? "",
  }));

  function update(k: string, v: any) {
    setForm((prev: any) => ({ ...prev, [k]: v }));
  }

  function toggleDay(day: number, active: boolean) {
    update("availability", {
      ...form.availability,
      [day]: active ? { start: 8, end: 18 } : null,
    });
  }

  async function handleSave() {
    if (!form.fullName.trim()) {
      toast.error("El nombre del trabajador es obligatorio.");
      return;
    }
    if (!form.documentId.trim()) {
      toast.error("El número de documento es obligatorio.");
      return;
    }
    const isDuplicate = (employees as any[]).some(
      (e: any) => e.id !== form.id && e.documentId === form.documentId.trim()
    );
    if (isDuplicate) {
      toast.error("Ya existe un trabajador con ese número de documento.");
      return;
    }
    const { linkedUserId, ...emp } = form;
    const prevLinkedUserId = currentLinkedUser?.id ?? "";

    if (linkedUserId !== prevLinkedUserId) {
      try {
        if (prevLinkedUserId) {
          await adminUpdateUser({ data: { id: prevLinkedUserId, employeeId: null } });
        }
        if (linkedUserId) {
          await adminUpdateUser({ data: { id: linkedUserId, employeeId: emp.id } });
        }
      } catch (e: any) {
        toast.error(`Error al vincular usuario: ${e.message}`);
        return;
      }
    }

    onSave(emp);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-card shadow-card w-full my-4 sm:my-8"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-base">
            {employee ? "Editar trabajador" : "Nuevo trabajador"}
          </h3>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre completo">
              <input
                className="fi"
                value={form.fullName}
                onChange={e => update("fullName", e.target.value)}
                placeholder="Nombre completo"
              />
            </Field>
            <Field label="Documento">
              <input
                className="fi"
                value={form.documentId}
                onChange={e => update("documentId", e.target.value)}
                placeholder="Número de identificación"
              />
            </Field>
            <Field label="Cargo">
              <input
                className="fi"
                value={form.position}
                onChange={e => update("position", e.target.value)}
                placeholder="Cargo o rol"
              />
            </Field>
            <Field label="Área">
              <select className="fi" value={form.areaId} onChange={e => update("areaId", e.target.value)}>
                {areas.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de contrato">
              <select className="fi" value={form.contractType} onChange={e => update("contractType", e.target.value)}>
                <option value="indefinido">Término indefinido</option>
                <option value="fijo">Término fijo</option>
                <option value="obra">Por prestación</option>
                <option value="aprendiz">Aprendiz SENA</option>
              </select>
            </Field>
            <Field label="Acceso (usuario vinculado)">
              <select
                className="fi"
                value={form.linkedUserId}
                onChange={e => update("linkedUserId", e.target.value)}
              >
                <option value="">— Sin vincular —</option>
                {(users as AppUser[])
                  .filter(u => !u.employeeId || u.id === currentLinkedUser?.id)
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName ? `${u.fullName} · ${u.email}` : u.email}
                    </option>
                  ))
                }
              </select>
            </Field>
          </div>

          {/* Disponibilidad semanal */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Disponibilidad semanal
            </span>
            <div className="mt-2 flex gap-2 flex-wrap">
              {DAY_LABELS.map(({ day, label }) => {
                const active = !!form.availability[day];
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day, !active)}
                    className={`h-10 min-w-10 px-2 rounded-pill text-sm font-medium transition-colors border ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90"
          >
            Guardar trabajador
          </button>
        </div>

        <style>{`.fi{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .875rem;font-size:.875rem;background:var(--color-card);outline:none}.fi:focus{border-color:color-mix(in srgb,var(--color-primary) 40%,transparent)}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
