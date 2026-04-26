import { useState } from 'react'
import EventFeed from './components/EventFeed'
import TrackList from './components/TrackList'
import UploadForm from './components/UploadForm'

function App() {
  const [refreshSignal, setRefreshSignal] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">Music Upload Pipeline</h1>
        <p className="text-xs text-gray-400 mt-0.5">FastAPI · Redis Pub/Sub · Cloudflare R2</p>
      </header>

      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <UploadForm onUploaded={() => setRefreshSignal((s) => s + 1)} />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col" style={{ minHeight: '320px' }}>
            <EventFeed onTerminalEvent={() => setRefreshSignal((s) => s + 1)} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <TrackList refreshSignal={refreshSignal} />
        </div>
      </main>
    </div>
  )
}

export default App
