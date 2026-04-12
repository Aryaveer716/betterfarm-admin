import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const priorityColor = (p: string) => {
  if (p === "urgent") return "bg-red-100 text-red-700";
  if (p === "high") return "bg-orange-100 text-orange-700";
  if (p === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-600";
};

const statusColor = (s: string) => {
  if (s === "open") return "bg-red-100 text-red-700";
  if (s === "in_progress") return "bg-blue-100 text-blue-700";
  if (s === "resolved") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-600";
};

export default function Support() {
  const [status, setStatus] = useState<"all" | "open" | "in_progress" | "resolved" | "closed">("all");
  const [priority, setPriority] = useState<"all" | "low" | "medium" | "high" | "urgent">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getTickets.useQuery({ status, priority, page, limit: 20 });
  const selectedTicket = data?.tickets?.find(t => t.id === selected);

  const update = trpc.admin.updateTicket.useMutation({
    onSuccess: () => { toast.success("Ticket updated"); utils.admin.getTickets.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage user support requests</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => { setPriority(v as any); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.tickets?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tickets found</p>
          ) : (
            <div className="space-y-2">
              {data?.tickets?.map((ticket) => (
                <div key={ticket.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => { setSelected(ticket.id); setNotes(ticket.adminNotes ?? ""); }}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <HelpCircle className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ticket.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {ticket.category && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{ticket.category}</span>}
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor(ticket.priority)}`}>{ticket.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(ticket.status)}`}>{ticket.status.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">{data?.total} total tickets</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total ?? 0)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ticket #{selected}</DialogTitle></DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{selectedTicket.subject}</p>
                <p className="text-sm text-muted-foreground mt-1">{selectedTicket.description}</p>
              </div>
              <div className="flex gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${priorityColor(selectedTicket.priority)}`}>{selectedTicket.priority}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor(selectedTicket.status)}`}>{selectedTicket.status.replace("_", " ")}</span>
              </div>
              <div>
                <label className="text-sm font-medium">Admin Notes</label>
                <Textarea className="mt-1" placeholder="Add notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <div>
                <label className="text-sm font-medium">Update Status</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
                    <Button key={s} size="sm" variant={selectedTicket.status === s ? "default" : "outline"}
                      onClick={() => update.mutate({ ticketId: selectedTicket.id, status: s, adminNotes: notes })}
                      disabled={update.isPending}>
                      {s.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            <Button onClick={() => selectedTicket && update.mutate({ ticketId: selectedTicket.id, adminNotes: notes })} disabled={update.isPending}>
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
