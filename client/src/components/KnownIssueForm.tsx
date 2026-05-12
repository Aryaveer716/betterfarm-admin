import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type KnownIssue = {
  id: number;
  fingerprint: string;
  title: string;
  description: string | null;
  farmerMessage: string | null;
};

export function KnownIssueForm({
  issue,
  open,
  onOpenChange,
  onSaved,
}: {
  issue: KnownIssue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [farmerMessage, setFarmerMessage] = useState(issue.farmerMessage ?? "");

  useEffect(() => {
    setTitle(issue.title);
    setDescription(issue.description ?? "");
    setFarmerMessage(issue.farmerMessage ?? "");
  }, [issue]);

  const upsert = trpc.adminHealth.upsertKnownIssue.useMutation({
    onSuccess: () => {
      toast.success("Issue updated");
      onSaved();
      onOpenChange(false);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit known issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fingerprint</Label>
            <p className="font-mono text-xs text-muted-foreground break-all">
              {issue.fingerprint}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="known-issue-title">Title</Label>
            <Input
              id="known-issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={256}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="known-issue-description">Internal description</Label>
            <Textarea
              id="known-issue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="known-issue-farmer-message">Farmer message</Label>
            <p className="text-xs text-muted-foreground">
              Slice E will surface this to affected users via Dusty when ready.
            </p>
            <Textarea
              id="known-issue-farmer-message"
              value={farmerMessage}
              onChange={(e) => setFarmerMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={upsert.isPending || title.trim().length === 0}
            onClick={() =>
              upsert.mutate({
                id: issue.id,
                fingerprint: issue.fingerprint,
                title: title.trim(),
                description: description.trim() || undefined,
                farmerMessage: farmerMessage.trim() || undefined,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
