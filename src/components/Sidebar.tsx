import { cx } from "@/lib/cx";
import type { UiStrings } from "@/lib/i18n";
import type { Conversation } from "@/lib/types";
import { LockIcon, PlusIcon, TrashIcon } from "./icons";

export const SIDEBAR_ID = "conversation-sidebar";

interface SidebarProps {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  t: UiStrings;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({
  open,
  conversations,
  activeId,
  t,
  onClose,
  onNew,
  onSelect,
  onDelete,
}: SidebarProps) {
  return (
    <>
      {/* Backdrop on small screens, where the sidebar overlays the chat. */}
      {open && (
        <div aria-hidden="true" className="fixed inset-0 z-20 bg-ink/30 md:hidden" onClick={onClose} />
      )}
      <aside
        id={SIDEBAR_ID}
        aria-label={t.conversations}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        className={cx(
          open ? "flex" : "hidden",
          "fixed inset-y-0 start-0 z-30 w-72 max-w-[85vw] flex-col border-e border-line bg-sunken md:static md:z-auto",
        )}
      >
        <div className="p-3">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand"
          >
            <PlusIcon width={18} height={18} />
            {t.newChat}
          </button>
        </div>

        <h2 className="px-5 pt-1 text-xs font-semibold tracking-wide text-muted">{t.conversations}</h2>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">{t.noConversations}</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeId;
                return (
                  <li
                    key={conversation.id}
                    className={cx(
                      "group flex items-center rounded-lg transition-colors",
                      isActive ? "bg-surface shadow-sm" : "hover:bg-surface/70",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      aria-current={isActive ? "true" : undefined}
                      className="min-w-0 flex-1 rounded-lg px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <span dir="auto" className={cx("block truncate", isActive ? "font-medium text-ink" : "text-ink/80")}>
                        {conversation.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(conversation.id)}
                      aria-label={t.deleteConversation(conversation.title)}
                      title={t.deleteConversation(conversation.title)}
                      className="me-1 rounded-md p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand md:opacity-0 md:group-hover:opacity-100"
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <p className="flex gap-2 border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
          <LockIcon width={14} height={14} className="mt-0.5 shrink-0" />
          <span>{t.storedLocally}</span>
        </p>
      </aside>
    </>
  );
}
