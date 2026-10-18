import React from 'react';
import { readerChapterHref } from '../reader/readerLocation.js';

function lastReadOf(novel) {
  const lastRead = novel && novel.lastRead;
  return lastRead && Number.isFinite(Number(lastRead.chapterNumber)) ? lastRead : null;
}

export function continueHref(novel) {
  const lastRead = lastReadOf(novel);
  if (!lastRead || !novel.id) return null;
  return readerChapterHref(novel.id, Number(lastRead.chapterNumber), Number(lastRead.paragraph) || 0);
}

export function lastReadLabel(novel) {
  const lastRead = lastReadOf(novel);
  return lastRead ? `Ch. ${Number(lastRead.chapterNumber)}` : '';
}

export function isLastRead(novel, chapterNumber) {
  const lastRead = lastReadOf(novel);
  return !!lastRead && Number(lastRead.chapterNumber) === Number(chapterNumber);
}

export function topParagraphIndex(rects, offset = 0) {
  if (!Array.isArray(rects) || rects.length === 0) return 0;
  const found = rects.findIndex((rect) => rect && rect.bottom > offset);
  return found === -1 ? rects.length - 1 : found;
}

export function restoreParagraph(saved, currentCount) {
  const count = Number(currentCount) || 0;
  if (!saved || count <= 0) return 0;
  const paragraph = Math.max(0, Number(saved.paragraph) || 0);
  const savedCount = Number(saved.count) || 0;
  const scaled = savedCount > 0 && savedCount !== count ? Math.round((paragraph * count) / savedCount) : paragraph;
  return Math.min(count - 1, Math.max(0, scaled));
}

export async function recordChapterOpened(storage, novelId, chapter, chapterNumber, paragraph = 0, count = 0) {
  if (!storage || typeof storage.setLastRead !== 'function' || !novelId || !chapter) return;
  try {
    await storage.setLastRead(novelId, { chapterNumber, paragraph, count, title: chapter.title || '' });
  } catch (e) {
    console.warn('[Reader] Could not save the last read chapter:', e);
  }
}

export function LastReadBadge({ novel, chapterNumber, compact = false }) {
  if (!isLastRead(novel, chapterNumber)) return null;
  return (
    <span
      data-last-read="true"
      className={`inline-flex items-center gap-1 flex-shrink-0 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} rounded font-semibold text-sky-300 bg-sky-500/15 border border-sky-500/30`}
      title="The chapter you read last"
    >
      <span aria-hidden="true">🔖</span>
      <span>Last read</span>
    </span>
  );
}

export function ContinueReadingButton({ novel, id, compact = false, target }) {
  const href = continueHref(novel);
  if (!href) return null;
  const lastRead = lastReadOf(novel);
  return (
    <a
      id={id}
      href={href}
      target={target}
      rel={target ? 'noreferrer' : undefined}
      title={lastRead.title ? `Continue: ${lastRead.title}` : 'Continue reading'}
      className={`inline-flex items-center gap-2 min-h-10 ${compact ? 'px-3 text-xs' : 'px-4 text-sm'} rounded-lg font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition shadow-sm max-w-full`}
    >
      <span aria-hidden="true">▶</span>
      <span className="whitespace-nowrap">Continue reading · {lastReadLabel(novel)}</span>
      {lastRead.title && !compact ? <span className="font-normal text-indigo-100 truncate">{lastRead.title}</span> : null}
    </a>
  );
}
