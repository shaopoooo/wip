import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

export function Layout() {
  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 overflow-hidden">
      <Header />
      <div className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
