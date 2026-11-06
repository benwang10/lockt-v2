import { useEffect, useState } from 'react';

import { getCachedSignedUrl, getSignedUrl, type Bucket } from '@/lib/api/storage';

/** Resolves a private storage path to a short-lived signed URL. */
export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  const key = path ? `${bucket}/${path}` : null;
  const cached = path ? getCachedSignedUrl(bucket, path) : null;
  const [resolved, setResolved] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path || !key || cached) return;
    let cancelled = false;
    getSignedUrl(bucket, path)
      .then((url) => !cancelled && setResolved({ key, url }))
      .catch(() => !cancelled && setResolved({ key, url: null }));
    return () => {
      cancelled = true;
    };
  }, [bucket, path, key, cached]);

  const current = resolved && resolved.key === key ? resolved : null;
  return {
    url: cached ?? current?.url ?? null,
    failed: !cached && !!current && current.url === null,
  };
}
