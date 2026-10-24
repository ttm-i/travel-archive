import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageCrop } from '../types'
import { useObjectUrl } from '../hooks/useObjectUrl'

export function BlobImage({ blob, alt, className, imageKey }: { blob?: Blob; alt: string; className?: string; imageKey?: string }) {
  const url = useObjectUrl(blob, blob ? imageKey : undefined)
  const [recoveryUrl, setRecoveryUrl] = useState('')
  const [autoRecoveryAttempted, setAutoRecoveryAttempted] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setRecoveryUrl(''); setAutoRecoveryAttempted(false); setFailed(false)
  }, [imageKey, blob])
  useEffect(() => () => { if (recoveryUrl) URL.revokeObjectURL(recoveryUrl) }, [recoveryUrl])
  if (!url) return <div className={`blob-image placeholder ${className ?? ''}`} role="img" aria-label={`${alt}（写真なし）`}><span>NO PHOTO</span></div>
  if (failed) return <div className={`blob-image placeholder ${className ?? ''}`} role="status"><span>PHOTO ERROR</span><button type="button" onClick={() => { if (!blob) return; setRecoveryUrl(URL.createObjectURL(blob)); setFailed(false) }}>再読み込み</button></div>
  return <img className={`blob-image ${className ?? ''}`} src={recoveryUrl || url} alt={alt} onError={() => {
    if (!blob) return
    if (!autoRecoveryAttempted) { setAutoRecoveryAttempted(true); setRecoveryUrl(URL.createObjectURL(blob)); return }
    setFailed(true)
  }} />
}

export function CroppedBlobImage({ blob, alt, crop, className, imageKey }: { blob?: Blob; alt: string; crop: ImageCrop; className?: string; imageKey?: string }) {
  const style = { '--crop-x': `${crop.x}%`, '--crop-y': `${crop.y}%`, '--crop-zoom': crop.zoom } as CSSProperties
  return <div className={`cropped-blob-image ${className ?? ''}`} style={style}><BlobImage blob={blob} alt={alt} imageKey={imageKey} /></div>
}

