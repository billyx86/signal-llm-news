import { useEffect } from 'react'
import { useBookmarkStore } from '@/lib/store'

export function useKeyboardShortcuts() {
  const toggleBookmark = useBookmarkStore(state => state.toggleBookmark)
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key.toLowerCase()) {
        case '/':
          e.preventDefault()
          const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement
          searchInput?.focus()
          break
        case 'j':
          e.preventDefault()
          // Navigate to next story - implementation in parent component
          window.dispatchEvent(new CustomEvent('navigate-next'))
          break
        case 'k':
          e.preventDefault()
          // Navigate to previous story
          window.dispatchEvent(new CustomEvent('navigate-prev'))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
