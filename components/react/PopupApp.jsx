import React, { useCallback, useState } from 'react';
import PopupMainView from './PopupMainView.jsx';
import PopupNovelView from './PopupNovelView.jsx';

const CHECKING = {
  variant: 'checking',
  host: '',
  subtitle: 'Detecting current page compatibility...'
};

export default function PopupApp() {
  const [novels, setNovels] = useState([]);
  const [status, setStatus] = useState(CHECKING);
  const [showDetail, setShowDetail] = useState(false);
  const [detailNovelId, setDetailNovelId] = useState(null);
  const [addBusy, setAddBusy] = useState(false);

  if (typeof window !== 'undefined') {
    window.__popupSetNovels = (list) => {
      console.log('[PopupApp] __popupSetNovels', Array.isArray(list) ? list.length : list);
      setNovels(Array.isArray(list) ? list : []);
    };
    window.__popupSetStatus = (next) => {
      console.log('[PopupApp] __popupSetStatus', next);
      setStatus(next && next.variant ? next : CHECKING);
    };
    window.__popupShowMain = () => {
      console.log('[PopupApp] __popupShowMain');
      setShowDetail(false);
    };
    window.__popupShowNovel = (id) => {
      console.log('[PopupApp] __popupShowNovel', id);
      setDetailNovelId(id);
      setShowDetail(true);
    };
  }

  const handleOpenNovel = useCallback((novel) => {
    console.log('[PopupApp] open novel', novel && novel.id);
    window.__popupActions && window.__popupActions.openNovel && window.__popupActions.openNovel(novel.id);
  }, []);

  const handleDeleteNovel = useCallback(async (novel) => {
    console.log('[PopupApp] delete novel', novel && novel.id);
    if (!window.StorageService) return;
    const updated = await window.StorageService.deleteNovel(novel.id);
    setNovels(Array.isArray(updated) ? updated : []);
    window.__popupActions && window.__popupActions.onNovelsChanged && window.__popupActions.onNovelsChanged();
  }, []);

  const handleAddNovel = useCallback(async () => {
    const info = status.novelInfo;
    console.log('[PopupApp] add novel', info);
    if (!info || !window.StorageService) return;
    setAddBusy(true);
    try {
      await window.StorageService.addNovel(info);
      if (info.slug) {
        await Promise.all([
          window.StorageService.syncNovelMetadata(info.slug),
          window.StorageService.syncNovelChapters(info.slug)
        ]);
      }
      const latest = await window.StorageService.getManagedNovels();
      setNovels(Array.isArray(latest) ? latest : []);
      window.__popupActions && window.__popupActions.onNovelsChanged && window.__popupActions.onNovelsChanged();
    } catch (err) {
      console.error('[PopupApp] add novel failed', err);
    } finally {
      setAddBusy(false);
    }
  }, [status]);

  console.log('[PopupApp] render', { novels: novels.length, variant: status.variant, showDetail, addBusy });

  return (
    <>
      <PopupMainView
        hidden={showDetail}
        novels={novels}
        status={status}
        addBusy={addBusy}
        onOpenNovel={handleOpenNovel}
        onDeleteNovel={handleDeleteNovel}
        onAddNovel={handleAddNovel}
        onOpenLibrary={() => window.__popupActions && window.__popupActions.openLibrary && window.__popupActions.openLibrary()}
        onOpenSettings={() => window.__popupActions && window.__popupActions.openSettings && window.__popupActions.openSettings()}
      />
      <PopupNovelView
        hidden={!showDetail}
        novelId={detailNovelId}
        onBack={() => window.__popupActions && window.__popupActions.backToMain && window.__popupActions.backToMain()}
        onOpenSettings={() => window.__popupActions && window.__popupActions.openSettings && window.__popupActions.openSettings()}
      />
    </>
  );
}
