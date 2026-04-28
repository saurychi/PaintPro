"use client";

import { useState } from "react";
import {
  ClipboardList,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StaffConversationMessage = {
  id: string;
  senderId: string;
  senderType: "admin" | "employee";
  text: string;
  createdAt: string;
};

type StaffConversation = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  employeeRole?: string;
  employeeAvatarUrl?: string | null;
  lastMessage?: string;
  unreadCount?: number;
  messages: StaffConversationMessage[];
};

type StaffMessageModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  conversations?: StaffConversation[];
  loadingConversations?: boolean;
  conversationLoadError?: string | null;
  onRetryLoadConversations?: () => void;

  selectedConversationId?: string;
  onSelectedConversationIdChange: (conversationId: string) => void;

  specsSentConversationIds?: string[];

  onCreateNew?: () => void;
  onFillSpecs?: () => void;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onApplyMeasurements?: (
    message: StaffConversationMessage,
  ) => Promise<void> | void;
  applyingMeasurementMessageId?: string | null;

  messageText: string;
  onMessageTextChange: (value: string) => void;

  sending: boolean;
  onSend: () => void;
};

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getLastMessagePreview(conversation: StaffConversation) {
  if (conversation.lastMessage?.trim()) return conversation.lastMessage;
  if (
    !conversation.messages ||
    !Array.isArray(conversation.messages) ||
    conversation.messages.length === 0
  ) {
    return "No messages yet.";
  }

  const last = conversation.messages[conversation.messages.length - 1];
  return last?.text || "No messages yet.";
}

export default function StaffMessageModal({
  open,
  onOpenChange,
  conversations = [],
  loadingConversations = false,
  conversationLoadError,
  onRetryLoadConversations,
  selectedConversationId = "",
  onSelectedConversationIdChange,
  specsSentConversationIds,
  onCreateNew,
  onFillSpecs,
  onDeleteMessage,
  onApplyMeasurements,
  applyingMeasurementMessageId = null,
  messageText,
  onMessageTextChange,
  sending,
  onSend,
}: StaffMessageModalProps) {
  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) || null;

  const canSend =
    Boolean(selectedConversation) && Boolean(messageText.trim()) && !sending;

  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  async function handleDeleteMessage(messageId: string) {
    if (!onDeleteMessage) return;

    setDeletingMsgId(messageId);
    try {
      await onDeleteMessage(messageId);
    } finally {
      setDeletingMsgId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={[
          "flex",
          "h-[min(80vh,560px)]",
          "w-[min(92vw,800px)]",
          "max-w-[800px]!",
          "flex-col",
          "overflow-hidden",
          "rounded-2xl",
          "border border-gray-200",
          "bg-white",
          "p-0",
          "shadow-2xl",
        ].join(" ")}>
        <div className="h-1.5 w-full shrink-0 bg-[#00c065]" />

        <DialogHeader className="shrink-0 border-b border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-[#00c065]">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold leading-5 text-gray-900">
                Message Employee
              </DialogTitle>
              <p className="mt-0.5 text-[12px] leading-4 text-gray-500">
                Manage conversations and reply to employee messages.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-hidden border-b border-gray-200 bg-gray-50 lg:border-b-0 lg:border-r">
            <div className="flex h-full min-h-0 flex-col p-3">
              <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-3">
                <p className="text-[13px] font-semibold text-gray-900">
                  Conversations
                </p>
                <button
                  type="button"
                  onClick={onCreateNew}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              </div>

              {loadingConversations ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                    <p className="mt-2 text-[12px] text-gray-500">
                      Loading conversations...
                    </p>
                  </div>
                </div>
              ) : conversationLoadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-[12px] font-semibold text-red-700">
                    Could not load conversations
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-red-600">
                    {conversationLoadError}
                  </p>
                  <button
                    type="button"
                    onClick={onRetryLoadConversations ?? (() => {})}
                    className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-[11px] font-semibold text-red-700 transition hover:bg-red-100">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                  <div>
                    <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-3 text-[13px] font-semibold text-gray-900">
                      No conversations yet
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-gray-500">
                      Start a new employee conversation.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {conversations.map((conversation) => {
                    const active = conversation.id === selectedConversationId;
                    const isSpecs =
                      specsSentConversationIds != null &&
                      specsSentConversationIds.includes(conversation.id);

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() =>
                          onSelectedConversationIdChange(conversation.id)
                        }
                        className={[
                          "w-full rounded-xl border p-3 text-left shadow-sm transition",
                          active
                            ? "border-[#00c065] bg-white ring-1 ring-[#00c065]/15"
                            : isSpecs
                              ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300"
                              : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-gray-900">
                              {conversation.employeeName}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-gray-500">
                              {getLastMessagePreview(conversation)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {isSpecs ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Specs sent
                              </span>
                            ) : null}
                            {conversation.unreadCount ? (
                              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#00c065] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <main className="min-h-0 min-w-0 overflow-hidden bg-white">
            {!selectedConversation ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-[14px] font-semibold text-gray-900">
                    Select a conversation
                  </p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    Choose an employee conversation from the left panel.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 border-b border-gray-200 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-gray-400">
                        {selectedConversation.employeeAvatarUrl ? (
                          <img
                            src={selectedConversation.employeeAvatarUrl}
                            alt={selectedConversation.employeeName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <UserRound className="h-5 w-5" />
                        )}
                      </div>
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#00c065]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-gray-900">
                        {selectedConversation.employeeName}
                      </p>
                      <p className="mt-0.5 text-[12px] text-gray-500">
                        {selectedConversation.employeeRole || "Staff"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-5">
                  <div className="space-y-4">
                    {!selectedConversation.messages ||
                    selectedConversation.messages.length === 0 ? (
                      <div className="flex h-full min-h-[200px] items-center justify-center text-center">
                        <div>
                          <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
                          <p className="mt-3 text-[13px] font-semibold text-gray-900">
                            No messages yet
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            Start the conversation below.
                          </p>
                        </div>
                      </div>
                    ) : (
                      selectedConversation.messages.map((message) => {
                        const isAdmin = message.senderType === "admin";
                        const isDeleting = deletingMsgId === message.id;
                        const isApplyingMeasurement =
                          applyingMeasurementMessageId === message.id;
                        const canApplyMeasurements =
                          !isAdmin &&
                          Boolean(onApplyMeasurements) &&
                          /\d/.test(message.text);
                        const canDelete = isAdmin && Boolean(onDeleteMessage);
                        const hasActions =
                          canDelete || canApplyMeasurements;

                        return (
                          <div
                            key={message.id}
                            className={[
                              "group flex w-full items-end gap-1.5",
                              isAdmin ? "justify-end" : "justify-start",
                            ].join(" ")}>
                            <div className="max-w-[78%]">
                              <div
                                className={[
                                  "rounded-2xl px-4 py-3 text-[13px] leading-6 shadow-sm",
                                  isAdmin
                                    ? "bg-[#00c065] text-white"
                                    : "border border-gray-200 bg-gray-50 text-gray-900",
                                  isDeleting ? "opacity-50" : "",
                                ].join(" ")}>
                                <p className="whitespace-pre-wrap break-all">
                                  {message.text}
                                </p>
                              </div>
                              <p
                                className={[
                                  "mt-1 text-[11px] text-gray-400",
                                  isAdmin ? "text-right" : "text-left",
                                ].join(" ")}>
                                {formatTime(message.createdAt)}
                              </p>
                            </div>

                            {hasActions ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={
                                      isDeleting || isApplyingMeasurement
                                    }
                                    className="mb-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-100">
                                    {isDeleting || isApplyingMeasurement ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                                    ) : (
                                      <MoreHorizontal className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align={isAdmin ? "start" : "end"}
                                  side="top"
                                  className="min-w-[180px]">
                                  {canApplyMeasurements ? (
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        void onApplyMeasurements?.(message);
                                      }}
                                      disabled={isApplyingMeasurement}
                                      className="text-[12px]">
                                      <ClipboardList className="mr-2 h-3.5 w-3.5" />
                                      Apply to Basic Details
                                    </DropdownMenuItem>
                                  ) : null}
                                  {canDelete ? (
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        void handleDeleteMessage(message.id);
                                      }}
                                      disabled={isDeleting}
                                      className="text-[12px] text-red-600 focus:text-red-600">
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      Delete
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    {onFillSpecs ? (
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <p className="text-[11px] leading-4 text-gray-500">
                          Add the configured surface details to this message.
                        </p>
                        <button
                          type="button"
                          onClick={onFillSpecs}
                          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                          <ClipboardList className="h-3.5 w-3.5" />
                          Paste Specs
                        </button>
                      </div>
                    ) : null}

                    <div className="flex items-end gap-3">
                      <textarea
                        value={messageText}
                        onChange={(e) => onMessageTextChange(e.target.value)}
                        placeholder="Type a message..."
                        rows={1}
                        className="min-h-11 max-h-32 flex-1 resize-none bg-transparent px-1 py-2 text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={onSend}
                        disabled={!canSend}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#00c065] px-5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#00a054] disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ backgroundColor: canSend ? ACCENT : undefined }}
                        onMouseEnter={(e) => {
                          if (canSend) {
                            e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (canSend) {
                            e.currentTarget.style.backgroundColor = ACCENT;
                          }
                        }}>
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
