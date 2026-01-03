import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";
import {
  LayoutGrid,
  LogOut,
  ChevronRight,
  ChevronDown,
  FileText,
  Key,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  ExternalLink,
  Users,
  Network,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getVersion } from "@/lib/get-version";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = useSession();
  const appVersion = getVersion();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Projects"]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved ? JSON.parse(saved) : false;
  });

  const handleSignOut = async () => {
    await signOut();
    void navigate("/signin");
  };

  const toggleExpanded = (itemName: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemName)
        ? prev.filter((name) => name !== itemName)
        : [...prev, itemName]
    );
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem("sidebarCollapsed", JSON.stringify(newValue));
      return newValue;
    });
  };

  // Extract project slug from URL if we're in a project context
  const projectMatch = /^\/projects\/([^/]+)/.exec(location.pathname);
  const currentProjectSlug = projectMatch ? projectMatch[1] : null;

  // Auto-expand Projects menu when in project context
  useEffect(() => {
    if (currentProjectSlug && !expandedItems.includes("Projects")) {
      setExpandedItems((prev) => [...prev, "Projects"]);
    }
  }, [currentProjectSlug]);

  const menuItems = [
    {
      name: "Projects",
      icon: LayoutGrid,
      path: "/projects",
      subItems: currentProjectSlug
        ? [
            {
              name: "Prompts",
              icon: FileText,
              path: `/projects/${currentProjectSlug}/prompts`,
            },
            {
              name: "Logs",
              icon: ScrollText,
              path: `/projects/${currentProjectSlug}/logs`,
            },
            {
              name: "Traces",
              icon: Network,
              path: `/projects/${currentProjectSlug}/traces`,
            },
          ]
        : [],
    },
    {
      name: "API Keys",
      icon: Key,
      path: "/api-keys",
      subItems: [],
    },
    {
      name: "API Docs",
      icon: FileText,
      path: "/api/docs",
      openInNewTab: true,
      subItems: [],
    },
    {
      name: "Users",
      icon: Users,
      path: "/users",
      subItems: [],
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`h-full border-r border-border bg-card flex flex-col shrink-0 transition-all duration-300 ${
          isSidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo/Brand */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          {!isSidebarCollapsed && (
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-sm font-semibold"><img alt={'LM SDK'} src={'/icon.png'}/></span>
              </div>
              <span className="font-semibold text-foreground">LM SDK</span>
            </button>
          )}
          {isSidebarCollapsed && (
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center mx-auto">
              <span className="text-primary-foreground text-sm font-semibold"><img alt={'LM SDK'} src={'/icon.png'}/></span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isExpanded = expandedItems.includes(item.name);
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExternal = "openInNewTab" in item && item.openInNewTab;

              return (
                <div key={item.path}>
                  {hasSubItems ? (
                    <button
                      onClick={() => {
                        toggleExpanded(item.name);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                        transition-colors duration-150
                        ${isSidebarCollapsed ? "justify-center" : ""}
                        ${isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }
                      `}
                      title={isSidebarCollapsed ? item.name : undefined}
                    >
                      <Icon size={18} strokeWidth={2} />
                      {!isSidebarCollapsed && (
                        <>
                          <span>{item.name}</span>
                          {isExpanded ? (
                            <ChevronDown size={16} className="ml-auto" strokeWidth={2} />
                          ) : (
                            <ChevronRight size={16} className="ml-auto" strokeWidth={2} />
                          )}
                        </>
                      )}
                    </button>
                  ) : (
                    <a
                      href={item.path}
                      onClick={(e) => {
                        if (isExternal) {
                          return;
                        }
                        // Allow browser default behavior for Cmd/Ctrl+Click
                        if (e.metaKey || e.ctrlKey) {
                          return;
                        }
                        e.preventDefault();
                        void navigate(item.path);
                      }}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noreferrer" : undefined}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                        transition-colors duration-150
                        ${isSidebarCollapsed ? "justify-center" : ""}
                        ${isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }
                      `}
                      title={isSidebarCollapsed ? item.name : undefined}
                    >
                      <Icon size={18} strokeWidth={2} />
                      {!isSidebarCollapsed && (
                        <>
                          <span>{item.name}</span>
                          <span className="ml-auto flex items-center gap-1">
                            {isExternal && <ExternalLink size={14} strokeWidth={2} />}
                            {isActive && <ChevronRight size={16} strokeWidth={2} />}
                          </span>
                        </>
                      )}
                    </a>
                  )}

                  {/* Sub-items */}
                  {!isSidebarCollapsed && hasSubItems && isExpanded && (
                    <div className="mt-1 space-y-1">
                      {item.subItems.map((subItem) => {
                        const SubIcon = subItem.icon;
                        const isSubActive = location.pathname === subItem.path;

                        return (
                          <a
                            key={subItem.path}
                            href={subItem.path}
                            onClick={(e) => {
                              // Allow browser default behavior for Cmd/Ctrl+Click
                              if (e.metaKey || e.ctrlKey) {
                                return;
                              }
                              e.preventDefault();
                              void navigate(subItem.path);
                            }}
                            className={`
                              w-full flex items-center gap-3 pl-10 pr-3 py-2 rounded-md text-sm font-medium
                              transition-colors duration-150
                              ${isSubActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              }
                            `}
                          >
                            <SubIcon size={16} strokeWidth={2} />
                            <span>{subItem.name}</span>
                            {isSubActive && (
                              <ChevronRight size={16} className="ml-auto" strokeWidth={2} />
                            )}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Toggle Button */}
        <div className="px-3 py-2 border-t border-border shrink-0">
          <button
            onClick={toggleSidebar}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors duration-150 ${
              isSidebarCollapsed ? "justify-center" : ""
            }`}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={18} strokeWidth={2} />
            ) : (
              <>
                <PanelLeftClose size={18} strokeWidth={2} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>

        {/* User section at bottom */}
        <div className="border-t border-border px-3 py-3 shrink-0">
          {!isSidebarCollapsed && (
            <div className="mb-3 px-3 py-2">
              <div className="text-sm font-medium text-foreground truncate">
                {session?.user.name || "User"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {session?.user.email}
              </div>
            </div>
          )}

          <Button
            onClick={() => { void handleSignOut(); }}
            variant="ghost"
            className={`w-full gap-3 text-muted-foreground hover:text-foreground ${
              isSidebarCollapsed ? "justify-center px-0" : "justify-start"
            }`}
            size="sm"
            title={isSidebarCollapsed ? "Sign out" : undefined}
          >
            <LogOut size={18} strokeWidth={2} />
            {!isSidebarCollapsed && <span>Sign out</span>}
          </Button>

          <div
            className={`mt-3 flex flex-col gap-2 text-xs text-muted-foreground ${
              isSidebarCollapsed ? "items-center" : "px-3"
            }`}
          >
            <div
              className={`w-full text-center ${isSidebarCollapsed ? "text-[10px]" : ""}`}
            >
              v{appVersion}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 h-full overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
