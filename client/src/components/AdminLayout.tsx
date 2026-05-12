import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AiFab } from "@/components/AiFab";
import { AiChatPanel } from "@/components/AiChatPanel";
import { AiPageContextProvider } from "@/lib/ai-page-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { Button } from "./ui/button";
import {
  LayoutDashboard, Users, Sprout, MessageSquare, ShoppingCart,
  Flag, HelpCircle, Bug, Zap, Activity, Settings, BarChart3,
  LogOut, PanelLeft, Leaf, BadgeCheck, Shield, DollarSign, HeartPulse,
  SlidersHorizontal
} from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const navSections = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    ],
  },
  {
    label: "Management",
    items: [
      { icon: Users, label: "Users", path: "/users" },
    ],
  },
  {
    label: "Content & Safety",
    items: [
      { icon: Shield, label: "Moderation", path: "/moderation" },
      { icon: MessageSquare, label: "Community", path: "/community" },
      { icon: Flag, label: "Reports", path: "/reports" },
    ],
  },
  {
    label: "AI & Detection",
    items: [
      { icon: Zap, label: "AI Oversight", path: "/ai-oversight" },
      { icon: Bug, label: "Disease Detection", path: "/disease-detection" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: SlidersHorizontal, label: "Operator", path: "/operator" },
      { icon: HelpCircle, label: "Support", path: "/support" },
      { icon: HeartPulse, label: "System Health", path: "/system-health" },
      { icon: Activity, label: "App Health", path: "/health" },
      { icon: Activity, label: "Activity Logs", path: "/activity-logs" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
  {
    label: "Verification",
    items: [
      { icon: BadgeCheck, label: "Verification", path: "/verification" },
    ],
  },
];

function AdminSidebarContent() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <>
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center shrink-0">
            <Leaf className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <p className="font-bold text-sm text-sidebar-foreground">BetterFarm</p>
              <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wider">Admin Portal</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">
              {section.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-9 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="text-sm">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                  {user?.name?.charAt(0).toUpperCase() ?? "A"}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name ?? "Admin"}</p>
                  <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email ?? ""}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [aiChatOpen, setAiChatOpen] = useState(false);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
            <Leaf className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">BetterFarm Admin</h1>
            <p className="text-muted-foreground mt-2 text-sm">Internal operations portal. Sign in to continue.</p>
          </div>
          <Button onClick={() => { window.location.href = getLoginUrl(); }} size="lg" className="w-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    // AiPageContextProvider wraps the entire authenticated layout so pages
    // can opt in to feeding the AI assistant their currently-loaded data
    // via useSetAiPageContext(). The provider survives navigations and
    // auto-clears its snapshot on route change.
    <AiPageContextProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r-0 bg-sidebar">
          <AdminSidebarContent />
        </Sidebar>
        <SidebarInset className="bg-background">
          <header className="h-14 border-b border-border flex items-center gap-3 px-4 bg-card sticky top-0 z-40">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground">
              <PanelLeft className="h-4 w-4" />
            </SidebarTrigger>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {user.role === "admin" ? "Administrator" : "User"}
              </span>
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>

        {/* AI assistant — mounted at layout root so it's available on every admin page.
            AiFab uses position:fixed (escapes flex flow); AiChatPanel renders via Radix
            Portal to document.body, so neither participates in the sidebar's layout. */}
        <AiFab onClick={() => setAiChatOpen(true)} />
        <AiChatPanel open={aiChatOpen} onOpenChange={setAiChatOpen} />
      </SidebarProvider>
    </AiPageContextProvider>
  );
}
