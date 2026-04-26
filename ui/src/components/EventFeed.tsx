import { useEffect, useRef, useState } from 'react'

interface TrackEvent {
  event: string
  track_id: number
  filename: string
  storage_url: string | null
  timestamp: string
  message: string | null
}

const EVENT_STYLES: Record<string, { badge: string; row: string }> = {
  'track.uploaded':   { badge: 'bg-blue-100 text-blue-800',   row: '' },
  'track.processing': { badge: 'bg-yellow-100 text-yellow-800', row: 'bg-yellow-50' },
  'track.processed':  { badge: 'bg-green-100 text-green-800',  row: 'bg-green-50' },
  'track.error':      { badge: 'bg-red-100 text-red-800',      row: 'bg-red-50' },
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return iso
  }
}

export default function EventFeed() {
  const [events, setEvents] = useState<TrackEvent[]>([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const es = new EventSource('/events/stream')

    es.onopen = () => setConnected(true)

    es.onmessage = (e) => {
      try {
        const payload: TrackEvent = JSON.parse(e.data)
        setEvents((prev) => [...prev, payload])
      } catch {
        // ignore malformed messages
      }
    }

    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      setConnected(false)
    }
  }, [])

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Live Event Feed</h2>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          {connected ? 'Connected' : 'Connecting…'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white min-h-0">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 py-12">
            Waiting for events…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-28">Time</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-36">Event</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">File</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-16">ID</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const style = EVENT_STYLES[ev.event] ?? { badge: 'bg-gray-100 text-gray-700', row: '' }
                return (
                  <tr key={i} className={`border-b border-gray-100 last:border-0 ${style.row}`}>
                    <td className="px-3 py-2 text-gray-400 tabular-nums whitespace-nowrap">
                      {formatTime(ev.timestamp)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-xs font-mono px-2 py-0.5 rounded-full ${style.badge}`}>
                        {ev.event}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 truncate max-w-xs">
                      {ev.filename}
                      {ev.message && (
                        <span className="ml-2 text-xs text-red-500">({ev.message})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 tabular-nums">#{ev.track_id}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>

      {events.length > 0 && (
        <button
          onClick={() => setEvents([])}
          className="self-end text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}
