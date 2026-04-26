import EventFeed from './components/EventFeed'
import UploadForm from './components/UploadForm'

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">Music Upload Pipeline</h1>
        <p className="text-xs text-gray-400 mt-0.5">FastAPI · Redis Pub/Sub · Cloudflare R2</p>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-73px)]">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <UploadForm />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col min-h-0">
          <EventFeed />
        </div>
      </main>
    </div>
  )
}

export default App
