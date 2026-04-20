'use client';

import { useState, useCallback } from 'react';
import { ChatBubbleLeftRightIcon, XMarkIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from './AuthModal';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { SocialFeed } from './SocialFeed';
import { ProfilePanel } from './ProfilePanel';
import type { Post } from '@/lib/socialRedis';

type Tab = 'clube' | 'feed';

export function SocialDrawer() {
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const { user, loading, logout } = useAuth();

  const handleProfileClick = useCallback((username: string) => {
    setProfileUsername(username);
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 border border-white/20 backdrop-blur-sm text-white shadow-lg transition-all hover:bg-white/20 hover:scale-105 active:scale-95 cursor-pointer"
        aria-label="Abrir chat da comunidade"
      >
        <ChatBubbleLeftRightIcon className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Comunidade"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-zinc-800 flex-shrink-0">
          <span className="text-sm font-semibold text-white font-sans">Comunidade</span>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto scrollbar-none min-h-0">
          {loading ? (
            <DrawerSkeleton />
          ) : user ? (
            <LoggedInContent user={user} onLogout={logout} onProfileClick={handleProfileClick} />
          ) : (
            <GuestContent onLogin={() => setAuthOpen(true)} />
          )}
        </div>

        {/* Profile panel — rendered at aside level so it covers header + body */}
        {profileUsername && user && (
          <ProfilePanel
            username={profileUsername}
            currentUserId={user.id}
            onClose={() => setProfileUsername(null)}
          />
        )}
      </aside>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}

/* ─── Guest view ──────────────────────────────────────────────────────────── */

function GuestContent({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800">
        <ChatBubbleLeftRightIcon className="h-7 w-7 text-zinc-400" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-white font-sans">
          Entre para participar da conversa
        </p>
        <p className="text-xs text-zinc-400 font-sans leading-relaxed max-w-[220px] mx-auto">
          Poste, siga outros torcedores e acompanhe as reações do seu clube.
        </p>
      </div>
      <button
        onClick={onLogin}
        className="rounded-full min-h-[44px] px-6 text-sm font-semibold font-sans bg-white text-zinc-950 hover:bg-zinc-100 transition-colors cursor-pointer"
      >
        Entrar / Criar conta
      </button>
    </div>
  );
}

/* ─── Logged-in view ──────────────────────────────────────────────────────── */

function LoggedInContent({
  user,
  onLogout,
  onProfileClick,
}: {
  user: { id: string; username: string; displayName: string; clubId: string | null };
  onLogout: () => Promise<void>;
  onProfileClick: (username: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('clube');
  const [newPosts, setNewPosts] = useState<Post[]>([]);

  const clubId = user.clubId ?? 'flamengo';

  const handleNewPost = useCallback((post: Post) => {
    setNewPosts((prev) => [post, ...prev]);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* User header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={() => onProfileClick(user.username)}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-club-primary text-white text-xs font-bold font-sans uppercase select-none cursor-pointer hover:opacity-80 transition-opacity"
          aria-label="Ver meu perfil"
        >
          {user.displayName?.[0] ?? user.username[0]}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white font-sans truncate">{user.displayName}</p>
          <p className="text-[11px] text-zinc-500 font-sans truncate">@{user.username}</p>
        </div>
        <button
          onClick={onLogout}
          className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Sair"
        >
          <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 flex-shrink-0">
        <TabButton active={tab === 'clube'} onClick={() => setTab('clube')}>Clube</TabButton>
        <TabButton active={tab === 'feed'} onClick={() => setTab('feed')}>Seguindo</TabButton>
      </div>

      {/* Composer — só no tab do clube */}
      {tab === 'clube' && (
        <div className="flex-shrink-0">
          <PostComposer
            authorDisplayName={user.displayName}
            clubId={clubId}
            onPost={handleNewPost}
          />
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-y-auto scrollbar-none min-h-0">
        {tab === 'clube' && newPosts.map((post) => (
          <div key={post.id} className="px-4 py-3 border-b border-zinc-800/60">
            <PostCard
              post={post}
              currentUserId={user.id}
              initialLiked={false}
              onProfileClick={onProfileClick}
            />
          </div>
        ))}

        {tab === 'clube' ? (
          <SocialFeed
            key={`clube-${clubId}`}
            feedType="club"
            clubId={clubId}
            currentUserId={user.id}
            onProfileClick={onProfileClick}
          />
        ) : (
          <SocialFeed
            key="personal"
            feedType="personal"
            currentUserId={user.id}
            onProfileClick={onProfileClick}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-xs font-semibold font-sans transition-colors cursor-pointer border-b-2 ${
        active
          ? 'border-club-primary text-white'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Skeleton ────────────────────────────────────────────────────────────── */

function DrawerSkeleton() {
  return (
    <div className="p-5 space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-zinc-800 flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 bg-zinc-800 rounded w-1/3" />
            <div className="h-2 bg-zinc-800 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

