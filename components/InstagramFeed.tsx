"use client";

import Image from "next/image";
import { useRef, useState, type MouseEvent } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";
import { ArrowUpRight, Heart, Layers, MessageCircle, Play } from "lucide-react";
import InstagramIcon from "./InstagramIcon";
import PillButton from "./PillButton";
import { captionExcerpt, formatCount, type InstagramPost, type InstagramProfile } from "@/lib/instagram/parse";
import { cn } from "@/lib/utils";

type Props = {
  posts: InstagramPost[];
  profile: InstagramProfile | null;
  /** Public handle without the @. */
  handle: string;
  /** Public profile URL. */
  url: string;
};

const SPRING = { stiffness: 220, damping: 24, mass: 0.6 };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

/**
 * One post tile. The card lives in a perspective viewport and tracks the cursor
 * with rotateX/rotateY springs; the photo inside counter-drifts and zooms so
 * the tile reads as a real 3D slab rather than a flat hover.
 */
function PostTile({ post, index }: { post: InstagramPost; index: number }) {
  const reduceMotion = useReducedMotionAfterMount();
  const ref = useRef<HTMLAnchorElement>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Normalised cursor position in [-0.5, 0.5]
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, SPRING);
  const sy = useSpring(my, SPRING);
  const rotateX = useTransform(sy, [-0.5, 0.5], [9, -9]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-9, 9]);
  const photoX = useTransform(sx, [-0.5, 0.5], [7, -7]);
  const photoY = useTransform(sy, [-0.5, 0.5], [7, -7]);
  const glareX = useTransform(sx, [-0.5, 0.5], ["20%", "80%"]);
  const glareY = useTransform(sy, [-0.5, 0.5], ["20%", "80%"]);
  const glare = useMotionTemplate`radial-gradient(240px circle at ${glareX} ${glareY}, rgba(255,244,220,0.22), transparent 60%)`;

  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (reduceMotion || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const excerpt = captionExcerpt(post.caption);
  const likes = formatCount(post.likeCount);
  const comments = formatCount(post.commentsCount);
  const kindLabel = post.mediaType === "VIDEO" ? "Reel" : post.mediaType === "CAROUSEL_ALBUM" ? "Album" : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 120, damping: 20, mass: 0.9, delay: (index % 4) * 0.07 }
      }
      className={cn("[perspective:1100px]", index >= 6 && "hidden lg:block")}
    >
      <motion.a
        ref={ref}
        href={post.permalink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={excerpt ? `Apri su Instagram: ${excerpt}` : "Apri il post su Instagram"}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        whileHover={reduceMotion ? undefined : { z: 24 }}
        whileTap={{ scale: 0.96 }}
        style={
          reduceMotion
            ? undefined
            : { rotateX, rotateY, willChange: "transform" }
        }
        className="group relative block aspect-square overflow-hidden rounded-2xl bg-brown-950 shadow-[0_18px_40px_-24px_rgba(42,26,16,0.5)] transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-[0_44px_80px_-28px_rgba(42,26,16,0.55)] focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none sm:rounded-3xl"
      >
        {/* Photo — counter-drifts against the tilt and zooms on hover */}
        <motion.div
          style={reduceMotion ? undefined : { x: photoX, y: photoY }}
          className="absolute -inset-3 transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.07]"
        >
          {imgFailed ? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brown-900 to-brown-950 text-gold/70">
              <InstagramIcon className="size-10" />
            </div>
          ) : (
            <Image
              src={post.imageUrl}
              alt={excerpt || "Post Instagram di Norcineria Taccalite"}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover"
              onError={() => setImgFailed(true)}
            />
          )}
        </motion.div>

        {/* Ambient gradient (always) + darker veil (hover) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brown-950/70 via-brown-950/5 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="pointer-events-none absolute inset-0 bg-brown-950/0 transition-colors duration-500 group-hover:bg-brown-950/25" />

        {/* Cursor-tracking glare */}
        {!reduceMotion && (
          <motion.div
            aria-hidden
            style={{ background: glare }}
            className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-500 group-hover:opacity-100"
          />
        )}

        {/* Media-type badge */}
        {kindLabel && (
          <span
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brown-950/55 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] text-cream uppercase backdrop-blur-md sm:top-4 sm:right-4 sm:text-[10px]"
          >
            {post.mediaType === "VIDEO" ? <Play className="size-3 fill-current" /> : <Layers className="size-3" />}
            {kindLabel}
          </span>
        )}

        {/* Caption + counts: revealed on hover (always visible on touch devices) */}
        <div
          className="absolute inset-x-0 bottom-0 flex translate-y-2 flex-col gap-2 p-4 opacity-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 sm:p-5 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
        >
          {excerpt && (
            <p className="line-clamp-2 text-xs leading-snug font-medium text-cream sm:text-sm">{excerpt}</p>
          )}
          <div className="flex items-center gap-2.5 overflow-hidden text-[10px] font-bold tracking-[0.12em] whitespace-nowrap text-cream/80 uppercase sm:gap-3 sm:tracking-[0.2em]">
            {likes && (
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3.5 fill-current text-gold" />
                {likes}
              </span>
            )}
            {comments && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="size-3.5" />
                {comments}
              </span>
            )}
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 normal-case tracking-normal">
              {formatDate(post.timestamp)}
              <ArrowUpRight className="size-3.5 text-gold" />
            </span>
          </div>
        </div>
      </motion.a>
    </motion.div>
  );
}

function ProfileChip({ profile, handle, url }: { profile: InstagramProfile | null; handle: string; url: string }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const stats = [
    profile?.mediaCount != null ? `${formatCount(profile.mediaCount)} post` : null,
    profile?.followersCount != null ? `${formatCount(profile.followersCount)} follower` : null,
  ].filter(Boolean);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/chip inline-flex items-center gap-3 rounded-full border border-brown-900/10 bg-white/60 py-2 pr-5 pl-2 transition-colors duration-500 hover:border-brown-900/25"
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-gold via-gold-dark to-brown-700 p-[2px]">
        <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full bg-cream">
          {profile?.profilePictureUrl && !avatarFailed ? (
            <Image
              src={profile.profilePictureUrl}
              alt=""
              fill
              sizes="44px"
              className="object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <InstagramIcon className="size-5 text-brown-950" />
          )}
        </span>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold text-brown-950">@{profile?.username ?? handle}</span>
        <span className="text-[10px] font-bold tracking-[0.2em] text-brown-800/60 uppercase">
          {stats.length ? stats.join(" · ") : "Ancona · dal 1946"}
        </span>
      </span>
    </a>
  );
}

/**
 * Homepage "social" section: the shop's latest Instagram posts as a tilting
 * 3D grid, headed by the live profile chip and a follow CTA. When the feed
 * isn't configured (or Instagram is unreachable with no cached copy) it
 * degrades to a compact "follow us" band, so the page never looks broken.
 */
export default function InstagramFeed({ posts, profile, handle, url }: Props) {
  const reduceMotion = useReducedMotionAfterMount();
  const hasPosts = posts.length > 0;

  return (
    <section
      id="instagram"
      aria-labelledby="instagram-heading"
      className="relative overflow-hidden bg-cream px-5 py-12 sm:px-12 sm:py-16"
    >
      <div className="parallax-orb pointer-events-none absolute -top-40 -left-40 h-[36rem] w-[36rem] opacity-[0.07]" />

      <div className="relative mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 110, damping: 20, mass: 0.9 }
          }
          className="mb-8 flex flex-col justify-between gap-6 sm:mb-10 md:flex-row md:items-end"
        >
          <div className="space-y-3">
            <span className="eyebrow eyebrow-dark inline-flex items-center gap-2">
              <InstagramIcon className="size-3.5" />
              Instagram
            </span>
            <h2
              id="instagram-heading"
              className="font-display max-w-2xl text-3xl leading-[0.95] tracking-tighter text-brown-950 sm:text-4xl md:text-5xl"
            >
              Dal banco
              <span className="text-gold-deep italic"> al tuo feed</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <ProfileChip profile={profile} handle={handle} url={url} />
            <PillButton href={url} external tone="gold" className="px-6 py-3 text-xs sm:text-sm">
              Seguici
              <ArrowUpRight className="size-4" />
            </PillButton>
          </div>
        </motion.div>

        {hasPosts ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 lg:gap-6">
            {posts.map((post, i) => (
              <PostTile key={post.id} post={post} index={i} />
            ))}
          </div>
        ) : (
          <motion.a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 36, scale: 0.985 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 110, damping: 20, mass: 0.9 }
            }
            whileTap={{ scale: 0.985 }}
            className="group relative flex flex-col items-start justify-between gap-8 overflow-hidden rounded-3xl bg-brown-950 p-7 will-change-transform sm:flex-row sm:items-center sm:rounded-[28px] sm:p-10"
          >
            <div className="bg-noise absolute inset-0 opacity-15" />
            <div className="parallax-orb absolute -top-32 -right-24 h-[24rem] w-[24rem] opacity-15" />
            <div className="relative flex items-start gap-5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold sm:size-14">
                <InstagramIcon className="size-6" />
              </span>
              <div className="space-y-2">
                <p className="text-[10px] font-bold tracking-[0.25em] text-gold uppercase">@{handle}</p>
                <h3 className="font-display max-w-md text-2xl leading-tight text-cream sm:text-3xl">
                  Le foto dal banco, la porchetta del sabato, le novità della bottega.
                </h3>
              </div>
            </div>
            <span className="relative inline-flex items-center gap-2 text-sm font-bold text-gold transition-all group-hover:gap-4">
              Seguici su Instagram
              <ArrowUpRight className="size-4" />
            </span>
          </motion.a>
        )}

        <p className="mt-6 text-[10px] font-bold tracking-[0.25em] text-brown-800/50 uppercase sm:mt-8">
          Foto e video pubblicati su Instagram · si aprono in una nuova scheda
        </p>
      </div>
    </section>
  );
}
