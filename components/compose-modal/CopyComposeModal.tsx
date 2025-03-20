"use client"

import { File } from "lucide-react"
import type { editor } from "monaco-editor"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"
import { siDocker } from "simple-icons"

import EmbeddedSettings from "@/components/settings/EmbeddedSettings"
import type { DockerTool } from "@/lib/docker-tools"
import { useSettings } from "@/lib/settings-context"

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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { ComposeEditor, EnvEditor, configureMonacoThemes } from "@/components/editors/MonacoEditor"
import { copyToClipboard, downloadFile } from "@/lib/docker-compose/file-operations"
import { generateComposeContent, generateEnvFileContent } from "@/lib/docker-compose/generators"
import ActionButtons from "./ActionButtons"
import PortConflictsAlert from "./PortConflictsAlert"

interface CopyComposeModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  selectedTools: DockerTool[]
}

export function CopyComposeModal({
  isOpen,
  onOpenChange,
  selectedTools,
}: CopyComposeModalProps) {
  // State
  const [showInterpolated, setShowInterpolated] = useState(false)
  const [composeContent, setComposeContent] = useState<string>("")
  const [envFileContent, setEnvFileContent] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("compose")
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [portConflicts, setPortConflicts] = useState<{
    fixed: number
    conflicts: string[]
  } | null>(null)
  
  // Refs
  const composeEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const envEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  
  // Hooks
  const { theme, resolvedTheme } = useTheme()
  const { settings } = useSettings()

  // After mounting, we can safely access the theme
  useEffect(() => {
    setMounted(true)
  }, [])

  // Generate the docker-compose and env file content
  useEffect(() => {
    if (!isOpen) return

    // Create environment variables file
    const envContent = generateEnvFileContent(settings)
    setEnvFileContent(envContent)

    // Create docker-compose file
    const { content, portConflicts } = generateComposeContent(
      selectedTools,
      settings,
      showInterpolated
    )
    
    setComposeContent(content)
    setPortConflicts(portConflicts)
  }, [isOpen, selectedTools, settings, showInterpolated])

  // Reset copied state when changing tabs
  useEffect(() => {
    setCopied(false)
  }, [activeTab])

  // Update editor theme when theme changes
  useEffect(() => {
    if (!mounted) return

    // Update the existing editors when theme changes
    if (composeEditorRef.current) {
      const currentTheme =
        resolvedTheme === "dark" ? "tailwind-dark" : "tailwind-light"
      composeEditorRef.current.updateOptions({ theme: currentTheme })
    }

    if (envEditorRef.current) {
      const currentTheme =
        resolvedTheme === "dark" ? "tailwind-dark" : "tailwind-light"
      envEditorRef.current.updateOptions({ theme: currentTheme })
    }
  }, [resolvedTheme, mounted])

  // Handle copy to clipboard
  const handleCopy = async () => {
    // Get content based on active tab
    const content =
      activeTab === "compose"
        ? composeEditorRef.current?.getValue() || composeContent
        : envEditorRef.current?.getValue() || envFileContent

    // Copy content to clipboard
    const success = await copyToClipboard(
      content, 
      activeTab as "compose" | "env", 
      selectedTools, 
      settings
    )
    
    if (success) {
      // Set copied state to show animation
      setCopied(true)

      // Add confetti animation class to the button
      const button = document.getElementById("copy-button")
      if (button) {
        button.classList.add("hover:motion-preset-confetti")
        // Remove the class after animation completes
        setTimeout(() => {
          button.classList.remove("hover:motion-preset-confetti")
        }, 1000)
      }

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    }
  }

  // Handle file download
  const handleDownload = () => {
    // Get content based on active tab
    const content =
      activeTab === "compose"
        ? composeEditorRef.current?.getValue() || composeContent
        : envEditorRef.current?.getValue() || envFileContent

    downloadFile(
      content, 
      activeTab as "compose" | "env", 
      selectedTools, 
      settings
    )
  }

  // Function to handle editor mounting
  const handleComposeEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    composeEditorRef.current = editor

    // Set the theme after mount to ensure it's correct
    if (mounted) {
      const currentTheme =
        resolvedTheme === "dark" ? "tailwind-dark" : "tailwind-light"
      editor.updateOptions({ theme: currentTheme })
    }
  }

  const handleEnvEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    envEditorRef.current = editor

    // Set the theme after mount to ensure it's correct
    if (mounted) {
      const currentTheme =
        resolvedTheme === "dark" ? "tailwind-dark" : "tailwind-light"
      editor.updateOptions({ theme: currentTheme })
    }
  }

  // Get the current theme for editors
  const currentTheme = !mounted
    ? "vs"
    : resolvedTheme === "dark"
      ? "tailwind-dark"
      : "tailwind-light"

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex h-[90vh] max-w-[95vw] flex-col overflow-y-auto">
        <AlertDialogHeader className="flex flex-row items-center justify-between">
          <div>
            <AlertDialogTitle>Docker Compose Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Generated docker-compose files for {selectedTools.length} selected
              service{selectedTools.length !== 1 ? "s" : ""}.
            </AlertDialogDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="interpolate-values"
                checked={showInterpolated}
                onCheckedChange={setShowInterpolated}
              />
              <Label htmlFor="interpolate-values">
                Show interpolated values
              </Label>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="flex-1">
          <EmbeddedSettings />

          {portConflicts && <PortConflictsAlert portConflicts={portConflicts} />}

          <div className="mb-2 flex items-center justify-between">
            <Tabs
              className="w-full"
              defaultValue="compose"
              onValueChange={setActiveTab}
              value={activeTab}
            >
              <TabsList>
                <TabsTrigger value="compose">
                  <svg
                    aria-label="GitHub"
                    role="img"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-2 h-4 w-4 fill-current"
                  >
                    <path d={siDocker.path} />
                  </svg>
                  docker-compose.yaml
                </TabsTrigger>
                <TabsTrigger value="env">
                  <File className="mr-2 h-4 w-4" />
                  .env
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <ActionButtons 
              onCopy={handleCopy}
              onDownload={handleDownload}
              copied={copied}
            />
          </div>

          <div className="h-[calc(65vh-40px)] flex-1 overflow-hidden rounded border">
            {activeTab === "compose" && (
              <ComposeEditor
                content={composeContent}
                onMount={handleComposeEditorDidMount}
                beforeMount={configureMonacoThemes}
                theme={currentTheme}
              />
            )}
            {activeTab === "env" && (
              <EnvEditor
                content={envFileContent}
                onMount={handleEnvEditorDidMount}
                theme={currentTheme}
              />
            )}
          </div>
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onOpenChange.bind(null, false)}>
            Done
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
} 