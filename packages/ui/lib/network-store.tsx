import { useEffect, useState } from "react"

function getOnlineState(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(getOnlineState)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  return online
}
