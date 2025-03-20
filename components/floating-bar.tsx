"use client"

import { ServiceCircles } from "@/components/magicui/avatar-circles"
import { SearchCommand } from "@/components/search-command"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import type { DockerTool } from "@/lib/docker-tools"
import { useSettings } from "@/lib/settings-context"
import { cn } from "@/lib/utils"
import { Search, Share2 } from "lucide-react"
import dynamic from "next/dynamic"
import posthog from "posthog-js"
import { useEffect, useState } from "react"

// Dynamically import CopyComposeModal with loading state
const CopyComposeModal = dynamic(
  () =>
    import("@/components/copy-compose-modal").then((mod) => ({
      default: mod.CopyComposeModal,
    })),
  {
    ssr: false, // Disable SSR for the Monaco editor to prevent hydration issues
  },
)

interface FloatingBarProps {
  selectedCount: number
  selectedTools: string[]
  selectedToolIds: string[]
  onReset?: () => void
  onToggleToolSelection: (toolId: string) => void
  scrollPosition?: number
  selectedToolObjects: DockerTool[]
}

export default function FloatingBar({
  selectedCount,
  selectedTools,
  selectedToolIds,
  onReset,
  onToggleToolSelection,
  scrollPosition = 200,
  selectedToolObjects,
}: FloatingBarProps) {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false)
  const [isFixed, setIsFixed] = useState(false)
  const [isApple, setIsApple] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const { settings, resetSettings } = useSettings()
  const { toast } = useToast()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsApple(/Mac|iPod|iPhone|iPad/.test(navigator.userAgent))
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleScroll = () => {
      setIsFixed(window.scrollY > scrollPosition)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [scrollPosition])

  const handleReset = () => {
    resetSettings()
    if (onReset) onReset()
    setIsResetDialogOpen(false)
  }

  const handleShare = async () => {
    if (selectedCount === 0) return
    
    const currentUrl = window.location.href
    
    try {
      await navigator.clipboard.writeText(currentUrl)
      
      // Create a temporary element for animation feedback
      const button = document.getElementById('share-button')
      if (button) {
        button.classList.add('animate-pulse')
        setTimeout(() => button.classList.remove('animate-pulse'), 1000)
      }
      
      toast({
        title: "URL copied to clipboard!",
        description: "Share this link to show your selected services",
      })
      
      posthog.capture("share_selection", {
        selected_tools: selectedTools,
        url: currentUrl,
      })
    } catch (err) {
      toast({
        title: "Failed to copy URL",
        description: "Please try again or copy manually",
        variant: "destructive",
      })
    }
  }

  // Prevent rendering client-interactive elements during SSR
  const triggerSearchShortcut = (e: React.MouseEvent) => {
    if (!isMounted) return

    e.preventDefault()

    // Use a custom event that the SearchCommand component will listen for
    // Instead of trying to simulate a keyboard event
    const customEvent = new CustomEvent("triggerCommandK", {
      bubbles: true,
    })
    document.dispatchEvent(customEvent)
  }

  return (
    <>
      <SearchCommand
        selectedTools={selectedToolIds}
        onToggleToolSelection={onToggleToolSelection}
      />

      {isMounted && (
        <>
          <AlertDialog
            open={isResetDialogOpen}
            onOpenChange={setIsResetDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all selections and settings to their default
                  values.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={handleReset}
                >
                  Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <CopyComposeModal
            isOpen={isCopyDialogOpen}
            onOpenChange={(open) => {
              if (open) {
                posthog.capture("copy_compose_opened", {
                  selected_tools: selectedTools,
                  settings: settings,
                })
              }
              setIsCopyDialogOpen(open)
            }}
            selectedTools={selectedToolObjects}
          />
        </>
      )}

      <div
        className={cn(
          "z-30 w-full transition-all duration-300",
          isFixed
            ? "fixed top-0 right-0 left-0 bg-background/60 py-4 shadow-lg backdrop-blur-md"
            : "relative mb-8 [animation-delay:450ms] motion-safe:animate-slide-down",
        )}
      >
        <div
          className={cn(
            "container mx-auto w-full px-0",
            isFixed && "max-w-7xl px-4",
          )}
        >
          <div
            className={cn(
              isFixed ? "flex flex-col gap-4" : "flex flex-col gap-4",
            )}
          >
            <div
              className={cn(
                isFixed
                  ? ""
                  : "rounded-lg border border-border bg-background/40 p-4 shadow-lg backdrop-blur-md motion-safe:animate-slide-up",
              )}
            >
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-lg">
                      {selectedCount} service{selectedCount !== 1 ? "s" : ""}{" "}
                      selected
                    </span>
                  </div>

                  {selectedCount > 0 && (
                    <div className="mt-2 flex max-w-[600px] flex-wrap gap-1.5">
                      <ServiceCircles
                        selectedServices={selectedToolObjects}
                        spacing="-space-x-2 sm:-space-x-4"
                        onToggleServiceSelection={onToggleToolSelection}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 transition-transform motion-safe:hover:scale-105"
                    onClick={triggerSearchShortcut}
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Search</span>
                    <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
                      <span className="text-xs">
                        {isMounted ? (isApple ? "⌘" : "Ctrl") : "⌘"}
                      </span>
                      K
                    </kbd>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedCount === 0}
                    className="flex items-center gap-2 transition-transform motion-safe:hover:scale-105"
                    onClick={handleShare}
                    id="share-button"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>Share</span>
                  </Button>

                  {onReset && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsResetDialogOpen(true)}
                      className="transition-transform motion-safe:hover:scale-105"
                    >
                      Reset All
                    </Button>
                  )}
                  <Button
                    disabled={selectedCount === 0}
                    size="sm"
                    className="hover:motion-preset-confetti font-semibold"
                    onClick={() => setIsCopyDialogOpen(true)}
                  >
                    Copy Compose
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
