"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Pagination, SearchInput, useTableSearch } from "./table-tools";
import { ALL_ROLES, roleLabel } from "@/lib/roles";
import type { User, UserStatus } from "@/lib/users";
import {
  addUserAction,
  deleteUserAction,
  setStatusAction,
  updateRoleAction,
} from "@/app/risansi/user-access-control/actions";

const STATUS_STYLES: Record<UserStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  disabled: "bg-gray-100 text-gray-600 ring-gray-200",
};

function StatusChip({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  tone,
  busy,
}: {
  label: string;
  onClick: () => void;
  tone: "primary" | "danger" | "neutral" | "warn";
  busy?: boolean;
}) {
  const cls =
    tone === "primary"
      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
      : tone === "danger"
        ? "border-rose-200 text-rose-600 hover:bg-rose-50"
        : tone === "warn"
          ? "border-amber-200 text-amber-700 hover:bg-amber-50"
          : "border-input-border text-foreground hover:bg-background";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : label}
    </button>
  );
}

export function UsersAccessView({
  users,
  currentEmail,
  platformAdminEmail,
}: {
  users: User[];
  currentEmail: string;
  platformAdminEmail: string;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const byStatus =
    statusFilter === "all"
      ? users
      : users.filter((u) => u.status === statusFilter);

  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(byStatus, (u) => `${u.full_name} ${u.email} ${u.role}`);

  const activeCount = users.filter((u) => u.status === "approved").length;

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if (!res.ok && res.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Users &amp; Access
        </h1>
        <p className="text-sm text-muted">
          {users.length} users · {activeCount} active
        </p>
      </div>

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, email, role…"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | UserStatus)}
          className="h-10 rounded-lg border border-input-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    No users match your filters.
                  </td>
                </tr>
              )}
              {pageRows.map((u) => {
                const isProtected =
                  u.email.toLowerCase() === platformAdminEmail.toLowerCase();
                const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className="text-foreground">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={u.status} />
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "approved" ? (
                        <span className="font-medium text-emerald-600">Yes</span>
                      ) : (
                        <span className="text-muted">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {(u.status === "pending" || u.status === "rejected") && (
                          <ActionButton
                            label="Approve"
                            tone="primary"
                            busy={busy}
                            onClick={() =>
                              run(u.id, () => setStatusAction(u.id, "approved"))
                            }
                          />
                        )}
                        {u.status === "pending" && !isProtected && (
                          <ActionButton
                            label="Reject"
                            tone="danger"
                            busy={busy}
                            onClick={() =>
                              run(u.id, () => setStatusAction(u.id, "rejected"))
                            }
                          />
                        )}
                        {u.status === "approved" && !isProtected && (
                          <ActionButton
                            label="Deactivate"
                            tone="warn"
                            busy={busy}
                            onClick={() =>
                              run(u.id, () => setStatusAction(u.id, "disabled"))
                            }
                          />
                        )}
                        {u.status === "disabled" && (
                          <ActionButton
                            label="Activate"
                            tone="primary"
                            busy={busy}
                            onClick={() =>
                              run(u.id, () => setStatusAction(u.id, "approved"))
                            }
                          />
                        )}
                        {!isProtected && (
                          <ActionButton
                            label="Edit"
                            tone="neutral"
                            onClick={() => setEditUser(u)}
                          />
                        )}
                        {!isProtected && !isSelf && (
                          <ActionButton
                            label="Delete"
                            tone="danger"
                            busy={busy}
                            onClick={() => {
                              if (
                                confirm(`Delete ${u.email}? This cannot be undone.`)
                              )
                                run(u.id, () => deleteUserAction(u.id));
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          from={from}
          to={to}
          total={total}
        />
      </div>

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} />}
      {editUser && (
        <EditRoleModal user={editUser} onClose={() => setEditUser(null)} />
      )}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-[10px] border border-input-border bg-surface px-[15px] text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-brand-label";

function AddUserModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await addUserAction(values);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <ModalShell title="Add user" onClose={onClose}>
      <form onSubmit={submit}>
        {error && (
          <div className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        <label className={labelClass}>Full name</label>
        <div className="mb-4">
          <input
            className={inputClass}
            value={values.fullName}
            onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
            placeholder="Jane Cooper"
          />
        </div>
        <label className={labelClass}>Email</label>
        <div className="mb-4">
          <input
            className={inputClass}
            type="email"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            placeholder="you@company.com"
          />
        </div>
        <label className={labelClass}>Temporary password</label>
        <div className="mb-4">
          <input
            className={inputClass}
            type="text"
            value={values.password}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
            placeholder="At least 6 characters"
          />
        </div>
        <label className={labelClass}>Role</label>
        <div className="mb-6">
          <select
            className={`${inputClass} cursor-pointer`}
            value={values.role}
            onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
          >
            <option value="">Select a role</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-[10px] border border-input-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Adding…" : "Add user"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditRoleModal({ user, onClose }: { user: User; onClose: () => void }) {
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await updateRoleAction(user.id, role);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <ModalShell title={`Edit role — ${user.full_name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && (
          <div className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        <label className={labelClass}>Role</label>
        <div className="mb-6">
          <select
            className={`${inputClass} cursor-pointer`}
            value={role}
            onChange={(e) => setRole(e.target.value as User["role"])}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-[10px] border border-input-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-card-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-5 font-display text-lg font-semibold text-foreground">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
