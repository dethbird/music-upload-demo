import { useCallback, useEffect, useState } from 'react'

interface Track {
  id: number
  filename: string
  storage_url: string | null
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-600',
  processing: 'bg-yellow-100 text-yellow-700',
  processed:  'bg-green-100 text-green-700',
  error:      'bg-red-100 text-red-700',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

interface TrackListProps {
  refreshSignal?: number
}

export default function TrackList({ refreshSignal }: TrackListProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTracks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/tracks')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setTracks(await res.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTracks() }, [fetchTracks, refreshSignal])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Tracks</h2>
        <button
          onClick={fetchTracks}
          disabled={loading}
          className="text-xs text-blue-500 hover:text-blue-700 underline disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {!loading && tracks.length === 0 && !error && (
        <p className="text-sm text-gray-400 py-6 text-center">No tracks yet.</p>
      )}

      {tracks.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-12">ID</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Filename</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-28">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-44">Uploaded</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">R2 URL</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400 tabular-nums">#{track.id}</td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs truncate max-w-xs">{track.filename}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[track.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {track.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs tabular-nums whitespace-nowrap">{formatDate(track.created_at)}</td>
                  <td className="px-3 py-2">
                    {track.storage_url ? (
                      <a
                        href={track.storage_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 underline text-xs truncate block max-w-xs"
                      >
                        {track.storage_url}
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
