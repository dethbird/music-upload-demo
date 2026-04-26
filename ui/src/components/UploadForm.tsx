import { useRef, useState } from 'react'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

interface UploadFormProps {
  onUploaded?: (trackId: number) => void
}

export default function UploadForm({ onUploaded }: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')

  function reset() {
    setState('idle')
    setProgress(0)
    setMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side guard — no request sent
    if (file.size > MAX_BYTES) {
      setState('error')
      setMessage('File exceeds the 50 MB limit. Please choose a smaller file.')
      return
    }

    uploadFile(file)
  }

  function uploadFile(file: File) {
    setState('uploading')
    setProgress(0)
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        setState('success')
        setMessage(`Track #${data.track_id} queued for processing.`)
        onUploaded?.(data.track_id)
      } else {
        let detail = `Server error ${xhr.status}`
        try {
          detail = JSON.parse(xhr.responseText).detail ?? detail
        } catch {
          // keep default
        }
        setState('error')
        setMessage(detail)
      }
    }

    xhr.onerror = () => {
      setState('error')
      setMessage('Network error — could not reach the server.')
    }

    xhr.open('POST', '/tracks/upload')
    xhr.send(formData)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-gray-800">Upload Audio</h2>

      <label
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors
          ${state === 'uploading' ? 'border-blue-300 bg-blue-50 cursor-not-allowed' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'}`}
      >
        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <span className="text-sm text-gray-500">
          {state === 'uploading' ? 'Uploading…' : 'Click to select an audio file (max 50 MB)'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          disabled={state === 'uploading'}
          onChange={handleChange}
        />
      </label>

      {/* Progress bar */}
      {state === 'uploading' && (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-500 h-2.5 rounded-full transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {state === 'uploading' && (
        <p className="text-sm text-blue-600 text-center">{progress}%</p>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-start gap-2">
          <span className="text-green-600 font-bold">✓</span>
          <div className="flex-1 text-sm text-green-800">{message}</div>
          <button onClick={reset} className="text-xs text-green-600 underline hover:text-green-800">Upload another</button>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <span className="text-red-600 font-bold">✕</span>
          <div className="flex-1 text-sm text-red-800">{message}</div>
          <button onClick={reset} className="text-xs text-red-600 underline hover:text-red-800">Try again</button>
        </div>
      )}
    </div>
  )
}
