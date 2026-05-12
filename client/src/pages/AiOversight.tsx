import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, MessageCircle, ThumbsUp, ThumbsDown, MapPin, Sprout, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AiOversight() {
  const [tab, setTab] = useState<"advice" | "conversations" | "feedback">("advice");
  const [cropSearch, setCropSearch] = useState("");
  const [userIdSearch, setUserIdSearch] = useState("");
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | "positive" | "negative">("all");
  const [page, setPage] = useState(1);

  const { data: adviceData, isLoading: adviceLoading } = trpc.admin.listAiAdviceHistory.useQuery(
    { cropType: cropSearch || undefined, page, limit: 20 },
    { enabled: tab === "advice" },
  );
  const userIdParsed = userIdSearch ? parseInt(userIdSearch, 10) : undefined;
  const { data: convData, isLoading: convLoading } = trpc.admin.listCopilotConversations.useQuery(
    { userId: userIdParsed && !isNaN(userIdParsed) ? userIdParsed : undefined, page, limit: 20 },
    { enabled: tab === "conversations" },
  );
  const { data: feedbackData, isLoading: feedbackLoading } = trpc.admin.listAiFeedback.useQuery(
    { feedback: feedbackFilter, page, limit: 20 },
    { enabled: tab === "feedback" },
  );

  const feedbackTotal = (feedbackData?.positiveCount ?? 0) + (feedbackData?.negativeCount ?? 0);
  const positiveRatio = feedbackTotal > 0 ? Math.round(((feedbackData?.positiveCount ?? 0) / feedbackTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Oversight</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Observe AI usage patterns. Advice = crop suitability queries. Conversations = chat turns.
          Feedback = user thumbs-up/down on advice quality.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Advice queries</p>
                <p className="text-3xl font-bold mt-1">{(adviceData?.total ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center">
                <Sprout className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Chat turns</p>
                <p className="text-3xl font-bold mt-1">{(convData?.total ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/30 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Positive feedback</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{positiveRatio}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feedbackData?.positiveCount ?? 0} / {feedbackTotal} ratings
                </p>
              </div>
              <div className="w-12 h-12 bg-green-50 dark:bg-green-950/30 rounded-xl flex items-center justify-center">
                <ThumbsUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => { setTab(v as "advice" | "conversations" | "feedback"); setPage(1); }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="advice">Advice</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>
          {tab === "advice" && (
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by crop…"
                value={cropSearch}
                onChange={(e) => { setCropSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
          )}
          {tab === "conversations" && (
            <Input
              placeholder="Filter by user ID…"
              type="number"
              value={userIdSearch}
              onChange={(e) => { setUserIdSearch(e.target.value); setPage(1); }}
              className="w-48"
            />
          )}
          {tab === "feedback" && (
            <Select value={feedbackFilter} onValueChange={(v) => { setFeedbackFilter(v as "all" | "positive" | "negative"); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All feedback</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value="advice">
          <Card>
            <CardContent className="pt-4">
              {adviceLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!adviceLoading && (adviceData?.advice.length ?? 0) === 0 && (
                <p className="text-center text-muted-foreground py-8">No advice queries.</p>
              )}
              <div className="space-y-2">
                {adviceData?.advice.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-border hover:bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                        <Sprout className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.cropType}</span>
                          {a.season && <Badge variant="outline" className="text-xs">{a.season}</Badge>}
                          {a.suitabilityScore !== null && (
                            <Badge variant="outline" className="text-xs">
                              score {Number(a.suitabilityScore).toFixed(0)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.location}</span>
                          {a.soilType && <span>· soil: {a.soilType}</span>}
                          <span>· user #{a.userId}</span>
                          <span>· {formatDistanceToNow(new Date(a.createdAt))} ago</span>
                        </div>
                        {a.advice && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.advice}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination data={adviceData} page={page} setPage={setPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversations">
          <Card>
            <CardContent className="pt-4">
              {convLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!convLoading && (convData?.conversations.length ?? 0) === 0 && (
                <p className="text-center text-muted-foreground py-8">No conversation turns.</p>
              )}
              <div className="space-y-2">
                {convData?.conversations.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg border border-border hover:bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        c.role === "user" ? "bg-blue-50 dark:bg-blue-950/30" : "bg-purple-50 dark:bg-purple-950/30"
                      }`}>
                        {c.role === "user" ? <MessageCircle className="w-4 h-4 text-blue-600" /> : <Zap className="w-4 h-4 text-purple-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{c.role}</Badge>
                          {c.isQuestion && <Badge variant="outline" className="text-xs">question</Badge>}
                          <span className="text-xs text-muted-foreground">user #{c.userId}</span>
                          <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(c.createdAt))} ago</span>
                        </div>
                        <p className="text-sm mt-1 line-clamp-3">{c.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination data={convData} page={page} setPage={setPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback">
          <Card>
            <CardContent className="pt-4">
              {feedbackLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!feedbackLoading && (feedbackData?.feedback.length ?? 0) === 0 && (
                <p className="text-center text-muted-foreground py-8">No feedback.</p>
              )}
              <div className="space-y-2">
                {feedbackData?.feedback.map((f) => (
                  <div key={f.id} className="p-3 rounded-lg border border-border hover:bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        f.feedback === "positive" ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"
                      }`}>
                        {f.feedback === "positive" ? (
                          <ThumbsUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <ThumbsDown className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={f.feedback === "positive" ? "default" : "destructive"} className="text-xs">
                            {f.feedback}
                          </Badge>
                          <span className="font-medium text-sm">{f.cropType}</span>
                          {f.language && <Badge variant="outline" className="text-xs">{f.language}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {f.district ? `${f.district}, ` : ""}{f.state ?? f.location}
                          </span>
                          <span>· {formatDistanceToNow(new Date(f.createdAt))} ago</span>
                        </div>
                        {f.comment && <p className="text-sm mt-1 italic">"{f.comment}"</p>}
                        {f.adviceSnippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            re: {f.adviceSnippet}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination data={feedbackData} page={page} setPage={setPage} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PaginationProps {
  data: { total: number } | undefined;
  page: number;
  setPage: (n: number | ((p: number) => number)) => void;
}

function Pagination({ data, page, setPage }: PaginationProps) {
  if (!data || data.total <= 20) return null;
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-muted-foreground">
        Page {page} of {Math.ceil(data.total / 20)} · {data.total} total
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= data.total}>
          Next
        </Button>
      </div>
    </div>
  );
}
