import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  listFriends,
  listPendingRequests,
  removeFriend,
  searchProfiles,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
  type ProfileSearchResult,
} from "@counter/shared";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Tab = "search" | "requests" | "friends";

interface Props {
  userId: string;
  onClose: () => void;
  onOpenFriend: (friendId: string) => void;
  // The friend list may have changed (accepted / removed) - the caller
  // reloads its feed on close.
}

export function FriendsPanel({ userId, onClose, onOpenFriend }: Props) {
  const [tab, setTab] = useState<Tab>("requests");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    try {
      const [reqs, fr] = await Promise.all([
        listPendingRequests(supabase),
        listFriends(supabase),
      ]);
      setRequests(reqs);
      setFriends(fr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta vänner.");
    }
  }, []);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchProfiles(supabase, query)
        .then(setResults)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Sökningen misslyckades."),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function act<T>(id: string, fn: () => Promise<T>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setBusyId(null);
    }
  }

  const incomingCount = requests.filter((r) => r.direction === "incoming").length;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>Vänner</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Stäng
          </button>
        </div>

        <div className="dialog-body">
          <div className="panel-tabs">
            <button
              type="button"
              className={tab === "search" ? "panel-tab panel-tab-active" : "panel-tab"}
              onClick={() => setTab("search")}
            >
              Sök
            </button>
            <button
              type="button"
              className={
                tab === "requests" ? "panel-tab panel-tab-active" : "panel-tab"
              }
              onClick={() => setTab("requests")}
            >
              Förfrågningar{incomingCount > 0 ? ` (${incomingCount})` : ""}
            </button>
            <button
              type="button"
              className={
                tab === "friends" ? "panel-tab panel-tab-active" : "panel-tab"
              }
              onClick={() => setTab("friends")}
            >
              Vänner
            </button>
          </div>

          {error && <p className="status error">{error}</p>}

          {tab === "search" && (
            <div className="panel-section">
              <input
                type="text"
                placeholder="Sök på namn"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {searching ? (
                <p className="status">Söker…</p>
              ) : query.trim().length >= 2 && results.length === 0 ? (
                <p className="status">Ingen hittades.</p>
              ) : (
                results.map((r) => (
                  <div key={r.id} className="panel-row">
                    <span className="panel-row-name">
                      {r.displayName ?? "Namnlös"}
                    </span>
                    {r.relationship === "none" ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() =>
                          void act(r.id, async () => {
                            await sendFriendRequest(supabase, userId, r.id);
                            setResults((prev) =>
                              prev.map((x) =>
                                x.id === r.id
                                  ? { ...x, relationship: "pending_sent" }
                                  : x,
                              ),
                            );
                          })
                        }
                      >
                        Följ
                      </button>
                    ) : (
                      <span className="panel-row-meta">
                        {r.relationship === "pending_sent"
                          ? "Skickad"
                          : r.relationship === "pending_received"
                            ? "Se Förfrågningar"
                            : "Vänner"}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "requests" && (
            <div className="panel-section">
              {requests.length === 0 ? (
                <p className="status">Inga förfrågningar just nu.</p>
              ) : (
                requests.map((req) => (
                  <div key={req.followId} className="panel-row">
                    <span className="panel-row-text">
                      <span className="panel-row-name">
                        {req.displayName ?? "Namnlös"}
                      </span>
                      <span className="panel-row-meta">
                        {req.direction === "incoming"
                          ? "Vill följa dig"
                          : "Väntar på svar"}
                      </span>
                    </span>
                    <span className="panel-row-actions">
                      {req.direction === "incoming" && (
                        <button
                          type="button"
                          disabled={busyId === req.followId}
                          onClick={() =>
                            void act(req.followId, async () => {
                              await acceptFriendRequest(supabase, req.followId);
                              await refreshLists();
                            })
                          }
                        >
                          Acceptera
                        </button>
                      )}
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busyId === req.followId}
                        onClick={() =>
                          void act(req.followId, async () => {
                            if (req.direction === "incoming") {
                              await declineFriendRequest(supabase, req.followId);
                            } else {
                              await cancelFriendRequest(supabase, req.followId);
                            }
                            await refreshLists();
                          })
                        }
                      >
                        {req.direction === "incoming" ? "Avvisa" : "Avbryt"}
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "friends" && (
            <div className="panel-section">
              {friends.length === 0 ? (
                <p className="status">Inga vänner än – sök fram någon under Sök.</p>
              ) : (
                friends.map((friend) => (
                  <div key={friend.id} className="panel-row">
                    <button
                      type="button"
                      className="panel-row-link"
                      onClick={() => onOpenFriend(friend.id)}
                    >
                      {friend.displayName ?? "Namnlös"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busyId === friend.id}
                      onClick={() =>
                        void act(friend.id, async () => {
                          await removeFriend(supabase, userId, friend.id);
                          await refreshLists();
                        })
                      }
                    >
                      Ta bort
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
