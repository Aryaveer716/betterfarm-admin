import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  Shield,
  User as UserIcon,
  MoreHorizontal,
  Ban,
  PauseCircle,
  PlayCircle,
  EyeOff,
  Eye,
  AlertOctagon,
  Plus,
  Minus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ModalKind =
  | { kind: "suspend"; userId: number; userName: string }
  | { kind: "ban"; userId: number; userName: string }
  | { kind: "shadowBan"; userId: number; userName: string }
  | { kind: "strike"; userId: number; userName: string }
  | { kind: "delete"; userId: number; userName: string }
  | null;

export default function Users() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | "user" | "admin">("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalKind>(null);
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getUsers.useQuery({
    search,
    role,
    page,
    limit: 20,
  });

  const closeModal = () => {
    setModal(null);
    setReason("");
    setDurationDays("7");
  };

  const onMutationSettled = () => {
    void utils.admin.getUsers.invalidate();
    closeModal();
  };

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const suspend = trpc.admin.suspendUser.useMutation({
    onSuccess: () => {
      toast.success("User suspended");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const unsuspend = trpc.admin.unsuspendUser.useMutation({
    onSuccess: () => {
      toast.success("Suspension lifted");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const ban = trpc.admin.banUser.useMutation({
    onSuccess: () => {
      toast.success("User banned");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const unban = trpc.admin.unbanUser.useMutation({
    onSuccess: () => {
      toast.success("Ban removed");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const shadowBan = trpc.admin.shadowBanUser.useMutation({
    onSuccess: () => {
      toast.success("Shadow ban applied");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeShadow = trpc.admin.removeShadowBan.useMutation({
    onSuccess: () => {
      toast.success("Shadow ban lifted");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const issueStrike = trpc.admin.issueStrike.useMutation({
    onSuccess: (res) => {
      toast.success(
        res.autoSuspended
          ? "Strike issued — user auto-suspended (3-strike rule)"
          : `Strike #${res.newStrikeCount} issued`,
      );
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });
  const clearStrikes = trpc.admin.clearStrikes.useMutation({
    onSuccess: () => {
      toast.success("Strikes cleared");
      onMutationSettled();
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending =
    suspend.isPending ||
    unsuspend.isPending ||
    ban.isPending ||
    unban.isPending ||
    shadowBan.isPending ||
    removeShadow.isPending ||
    issueStrike.isPending ||
    clearStrikes.isPending ||
    deleteUser.isPending ||
    updateRole.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage users — suspend, ban, shadow-ban, issue strikes. Every action is audit-logged.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v as "all" | "user" | "admin");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          )}

          {!isLoading && (data?.users.length ?? 0) === 0 && (
            <p className="text-center text-muted-foreground py-8">No users found.</p>
          )}

          <div className="space-y-2">
            {data?.users.map((u) => {
              const displayName = u.name || u.email || `user-${u.id}`;
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-semibold shrink-0">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{displayName}</span>
                        {u.role === "admin" && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="w-3 h-3 mr-1" />
                            admin
                          </Badge>
                        )}
                        {u.isBanned && (
                          <Badge variant="destructive" className="text-xs">
                            Banned
                          </Badge>
                        )}
                        {u.isSuspended && !u.isBanned && (
                          <Badge variant="destructive" className="text-xs">
                            Suspended
                          </Badge>
                        )}
                        {u.isShadowBanned && (
                          <Badge variant="outline" className="text-xs">
                            Shadow-banned
                          </Badge>
                        )}
                        {u.totalStrikes > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {u.totalStrikes} strike{u.totalStrikes === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email ?? "no email"} ·{" "}
                        {u.createdAt
                          ? `joined ${formatDistanceToNow(new Date(u.createdAt))} ago`
                          : "joined ?"}
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        aria-label={`Actions for ${displayName}`}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onSelect={() =>
                          updateRole.mutate({
                            userId: u.id,
                            role: u.role === "admin" ? "user" : "admin",
                          })
                        }
                      >
                        {u.role === "admin" ? (
                          <UserIcon className="w-4 h-4 mr-2" />
                        ) : (
                          <Shield className="w-4 h-4 mr-2" />
                        )}
                        {u.role === "admin" ? "Demote to user" : "Promote to admin"}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {u.isSuspended ? (
                        <DropdownMenuItem
                          onSelect={() => unsuspend.mutate({ userId: u.id })}
                        >
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Lift suspension
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onSelect={() =>
                            setModal({ kind: "suspend", userId: u.id, userName: displayName })
                          }
                        >
                          <PauseCircle className="w-4 h-4 mr-2" />
                          Suspend…
                        </DropdownMenuItem>
                      )}

                      {u.isBanned ? (
                        <DropdownMenuItem onSelect={() => unban.mutate({ userId: u.id })}>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Lift ban
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            setModal({ kind: "ban", userId: u.id, userName: displayName })
                          }
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Ban…
                        </DropdownMenuItem>
                      )}

                      {u.isShadowBanned ? (
                        <DropdownMenuItem
                          onSelect={() => removeShadow.mutate({ userId: u.id })}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Lift shadow ban
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onSelect={() =>
                            setModal({ kind: "shadowBan", userId: u.id, userName: displayName })
                          }
                        >
                          <EyeOff className="w-4 h-4 mr-2" />
                          Shadow ban…
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onSelect={() =>
                          setModal({ kind: "strike", userId: u.id, userName: displayName })
                        }
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Issue strike…
                      </DropdownMenuItem>

                      {u.totalStrikes > 0 && (
                        <DropdownMenuItem onSelect={() => clearStrikes.mutate({ userId: u.id })}>
                          <Minus className="w-4 h-4 mr-2" />
                          Clear strikes
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                          setModal({ kind: "delete", userId: u.id, userName: displayName })
                        }
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete user…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 20)} · {data.total} users
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * 20 >= data.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modal !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.kind === "suspend" && `Suspend ${modal.userName}`}
              {modal?.kind === "ban" && `Ban ${modal.userName}`}
              {modal?.kind === "shadowBan" && `Shadow ban ${modal.userName}`}
              {modal?.kind === "strike" && `Issue strike to ${modal.userName}`}
              {modal?.kind === "delete" && `Delete ${modal.userName}`}
            </DialogTitle>
          </DialogHeader>

          {modal?.kind === "delete" && (
            <p className="text-sm text-muted-foreground">
              This permanently deletes the user record. Their content stays. This action cannot
              be undone.
            </p>
          )}

          {modal && modal.kind !== "delete" && (
            <div className="space-y-3">
              {modal.kind === "suspend" && (
                <div className="space-y-1">
                  <Label className="text-sm">Duration (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Between 1 and 365 days.</p>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-sm">Reason</Label>
                <Input
                  placeholder={
                    modal.kind === "strike"
                      ? "Reason for strike (e.g. spam, harassment)"
                      : "Reason (visible to admins)"
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
              </div>
              {modal.kind === "strike" && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <AlertOctagon className="w-3 h-3 mt-0.5 shrink-0" />
                  3rd strike auto-suspends the user for 7 days.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              variant={modal?.kind === "ban" || modal?.kind === "delete" ? "destructive" : "default"}
              disabled={
                isPending ||
                (modal !== null && modal.kind !== "delete" && reason.trim() === "") ||
                (modal?.kind === "suspend" && (Number(durationDays) < 1 || Number(durationDays) > 365))
              }
              onClick={() => {
                if (!modal) return;
                if (modal.kind === "delete") {
                  deleteUser.mutate({ userId: modal.userId });
                  return;
                }
                if (modal.kind === "suspend") {
                  suspend.mutate({
                    userId: modal.userId,
                    reason: reason.trim(),
                    durationDays: Number(durationDays),
                  });
                  return;
                }
                if (modal.kind === "ban") {
                  ban.mutate({ userId: modal.userId, reason: reason.trim() });
                  return;
                }
                if (modal.kind === "shadowBan") {
                  shadowBan.mutate({ userId: modal.userId, reason: reason.trim() });
                  return;
                }
                if (modal.kind === "strike") {
                  issueStrike.mutate({ userId: modal.userId, reason: reason.trim() });
                  return;
                }
              }}
            >
              {modal?.kind === "delete" ? "Delete" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
