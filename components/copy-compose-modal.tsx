"use client"

import type { DockerSettings } from "@/components/settings-panel"
import SettingsPanel from "@/components/settings-panel"
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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import type { DockerTool } from "@/lib/docker-tools"
import { cn } from "@/lib/utils"
import Editor from "@monaco-editor/react"
import { Settings as SettingsIcon } from "lucide-react"
import type { editor } from "monaco-editor"
import { useTheme } from "next-themes"
import posthog from "posthog-js"
import { useEffect, useRef, useState } from "react"

interface CopyComposeModalProps {
	isOpen: boolean
	onOpenChange: (open: boolean) => void
	selectedTools: DockerTool[]
}

// Compose schema URL
const COMPOSE_SCHEMA_URL = "https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json"

export function CopyComposeModal({
	isOpen,
	onOpenChange,
	selectedTools,
}: CopyComposeModalProps) {
	const [showInterpolated, setShowInterpolated] = useState(false)
	const [showSettings, setShowSettings] = useState(false)
	const [composeContent, setComposeContent] = useState<string>("")
	const [envFileContent, setEnvFileContent] = useState<string>("")
	const [activeTab, setActiveTab] = useState<string>("compose")
	const composeEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
	const envEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
	const { theme } = useTheme()
	
	const { value: settings, setValue: setSettings } = useLocalStorage<DockerSettings>("docker-settings", {
		configPath: "/config",
		dataPath: "/data",
		timezone: "UTC",
		puid: "1000",
		pgid: "1000",
		umask: "022",
		restartPolicy: "unless-stopped",
		networkMode: "bridge",
		useTraefik: false,
		containerNamePrefix: "docker-",
	})

	// Function to configure Monaco with YAML schema
	const handleEditorWillMount = (monaco: typeof import("monaco-editor")) => {
		// Define a theme based on Tailwind CSS
		monaco.editor.defineTheme('tailwind-dark', {
			base: 'vs-dark',
			inherit: true,
			rules: [],
			colors: {
				'editor.background': '#1e293b', // slate-800
				'editor.foreground': '#e2e8f0', // slate-200
				'editorCursor.foreground': '#38bdf8', // sky-400
				'editor.lineHighlightBackground': '#334155', // slate-700
				'editorLineNumber.foreground': '#94a3b8', // slate-400
				'editor.selectionBackground': '#475569', // slate-600
				'editor.inactiveSelectionBackground': '#334155', // slate-700
			},
		});
		
		monaco.editor.defineTheme('tailwind-light', {
			base: 'vs',
			inherit: true,
			rules: [],
			colors: {
				'editor.background': '#f8fafc', // slate-50
				'editor.foreground': '#334155', // slate-700
				'editorCursor.foreground': '#0284c7', // sky-600
				'editor.lineHighlightBackground': '#e2e8f0', // slate-200
				'editorLineNumber.foreground': '#64748b', // slate-500
				'editor.selectionBackground': '#cbd5e1', // slate-300
				'editor.inactiveSelectionBackground': '#e2e8f0', // slate-200
			},
		});

		// Register YAML schema
		try {
			// Try to configure YAML schema validation
			const yamlDefaults = monaco.languages.yaml?.yamlDefaults;
			if (yamlDefaults) {
				yamlDefaults.setDiagnosticsOptions({
					validate: true,
					enableSchemaRequest: true,
					hover: true,
					completion: true,
					schemas: [
						{
							uri: COMPOSE_SCHEMA_URL,
							fileMatch: ['*'],
							schema: {
								$schema: "http://json-schema.org/draft-07/schema#",
								type: "object",
								required: ["services"],
								properties: {
									version: { type: "string" },
									services: {
										type: "object",
										additionalProperties: true
									}
								}
							}
						}
					]
				});
			} else {
				// Fallback to JSON schema validation
				monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
					validate: true,
					schemas: [{
						uri: COMPOSE_SCHEMA_URL,
						fileMatch: ["*docker-compose*", "*.yml", "*.yaml"],
						schema: {
							type: "object",
							required: ["services"],
							properties: {
								version: { type: "string" },
								services: {
									type: "object",
									additionalProperties: true
								}
							}
						}
					}]
				});
			}
		} catch (error) {
			console.error("Error configuring Monaco YAML schema:", error);
		}
	}

	// Generate the docker-compose and env file content
	useEffect(() => {
		if (!isOpen) return
		
		// Create environment variables file
		const envFileContent = `# Docker Compose Environment Variables
# These can be overridden by setting them in your shell or in a .env file

# User/Group Identifiers
# These help avoid permission issues between host and container
PUID=${settings.puid}
PGID=${settings.pgid}
UMASK=${settings.umask}

# Container name prefix
CONTAINER_PREFIX=${settings.containerNamePrefix}

# Paths for persistent data
CONFIG_PATH=${settings.configPath}
DATA_PATH=${settings.dataPath}

# Container settings
TZ=${settings.timezone}
RESTART_POLICY=${settings.restartPolicy}
NETWORK_MODE=${settings.networkMode}
`;
		setEnvFileContent(envFileContent);
		
		// Create docker-compose without environment variables section
		const composeHeader = `# Docker Compose Configuration
version: '3.8'

# Common settings using YAML anchors
x-environment: &default-tz
  TZ: \${TZ:-${settings.timezone}}

x-user: &default-user
  PUID: \${PUID:-${settings.puid}}
  PGID: \${PGID:-${settings.pgid}}
  UMASK: \${UMASK:-${settings.umask}}

# Common settings
x-common: &common-settings
  restart: \${RESTART_POLICY:-${settings.restartPolicy}}
  
`;

		// Generate services section
		let servicesSection = `services:
`;

		// Add each selected tool
		selectedTools.forEach((tool) => {
			if (!tool.composeContent) return;

			// Add a comment with the tool description
			servicesSection += `  # ${tool.name}: ${tool.description}
`;
			// Process the compose content - properly indent everything
			let toolContent = tool.composeContent
				.replace(/^services:\s*/gm, "") // Remove the services: line
				.replace(/^\s{2}(\S)/gm, "  $1"); // Ensure consistent indentation for first level
				
			// Make sure indentation is consistent throughout
			const lines = toolContent.split('\n');
			const processedLines = lines.map(line => {
				// Skip empty lines
				if (line.trim() === '') return line;
				// If line starts with a service name or other first-level key
				if (line.match(/^\s*[a-zA-Z0-9_-]+:/) || line.startsWith('volumes:')) {
					return `  ${line.trim()}`;
				} 
				// Otherwise it's a nested property, add more indentation
				return `    ${line.trim()}`;
			});
			toolContent = processedLines.join('\n');

			// Replace variables with their values if showInterpolated is true
			if (showInterpolated) {
				toolContent = toolContent
					.replace(/\$\{CONFIG_PATH\}/g, settings.configPath)
					.replace(/\$\{DATA_PATH\}/g, settings.dataPath)
					.replace(/\$\{TZ\}/g, settings.timezone)
					.replace(/\$\{PUID\}/g, settings.puid)
					.replace(/\$\{PGID\}/g, settings.pgid)
					.replace(/\$\{UMASK\}/g, settings.umask)
					.replace(/\$\{RESTART_POLICY\}/g, settings.restartPolicy)
					.replace(/\$\{NETWORK_MODE\}/g, settings.networkMode)
					.replace(/\$\{CONTAINER_PREFIX\}/g, settings.containerNamePrefix);
			}

			servicesSection += `${toolContent}\n`;
		});

		const completeCompose = composeHeader + servicesSection;
		setComposeContent(completeCompose);
	}, [isOpen, selectedTools, settings, showInterpolated]);

	const handleCopy = () => {
		// Get content based on active tab
		const content = activeTab === "compose" 
			? composeEditorRef.current?.getValue() || composeContent
			: envEditorRef.current?.getValue() || envFileContent;
		
		// Copy the content to clipboard
		navigator.clipboard.writeText(content)
			.then(() => {
				console.log(`${activeTab === "compose" ? "Docker compose" : "Environment file"} copied to clipboard`);
				posthog.capture("copy_compose_success", {
					selected_tools: selectedTools.map(t => t.id),
					settings: settings,
					file_type: activeTab,
				});
				onOpenChange(false);
			})
			.catch(err => {
				console.error("Failed to copy: ", err);
			});
	}

	// Function to handle editor mounting
	const handleComposeEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
		composeEditorRef.current = editor;
	}

	const handleEnvEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
		envEditorRef.current = editor;
	}

	return (
		<AlertDialog open={isOpen} onOpenChange={onOpenChange}>
			<AlertDialogContent className="flex flex-col max-h-[90vh] max-w-[95vw]">
				<AlertDialogHeader className="flex flex-row items-center justify-between">
					<div>
						<AlertDialogTitle>Docker Compose Configuration</AlertDialogTitle>
						<AlertDialogDescription>
							Generated docker-compose files for {selectedTools.length}{" "}
							selected service{selectedTools.length !== 1 ? "s" : ""}.
						</AlertDialogDescription>
					</div>
					<div className="flex gap-4 items-center">
						<div className="flex items-center space-x-2">
							<Switch
								id="interpolate-values"
								checked={showInterpolated}
								onCheckedChange={setShowInterpolated}
							/>
							<Label htmlFor="interpolate-values">Show interpolated values</Label>
						</div>
						
						<Button 
							className="flex gap-2 items-center"
							onClick={() => setShowSettings(!showSettings)}
							size="sm"
							variant="outline" 
						>
							<SettingsIcon className="h-4 w-4" />
							{showSettings ? "Hide Settings" : "Show Settings"}
						</Button>
					</div>
				</AlertDialogHeader>

				<div className={cn("grid gap-4", showSettings ? "grid-cols-[1fr_350px]" : "grid-cols-1")}>
					<div className="flex-1 h-[60vh]">
						<Tabs defaultValue="compose" value={activeTab} onValueChange={setActiveTab} className="w-full">
							<TabsList className="mb-2">
								<TabsTrigger value="compose">docker-compose.yaml</TabsTrigger>
								<TabsTrigger value="env">.env</TabsTrigger>
							</TabsList>
							<TabsContent className="border flex-1 h-[calc(60vh-40px)] overflow-hidden rounded" value="compose">
								<Editor
									defaultLanguage="yaml"
									defaultValue={composeContent}
									height="100%"
									onMount={handleComposeEditorDidMount}
									options={{
										automaticLayout: true,
										fontSize: 13,
										minimap: { enabled: false },
										readOnly: false,
										scrollBeyondLastLine: false,
										wordWrap: "on",
									}}
									theme={theme === 'dark' ? 'tailwind-dark' : 'tailwind-light'}
									value={composeContent}
									beforeMount={handleEditorWillMount}
								/>
							</TabsContent>
							<TabsContent className="border flex-1 h-[calc(60vh-40px)] overflow-hidden rounded" value="env">
								<Editor
									defaultLanguage="ini"
									defaultValue={envFileContent}
									height="100%"
									onMount={handleEnvEditorDidMount}
									options={{
										automaticLayout: true,
										fontSize: 13,
										minimap: { enabled: false },
										readOnly: false,
										scrollBeyondLastLine: false,
										wordWrap: "on",
									}}
									theme={theme === 'dark' ? 'tailwind-dark' : 'tailwind-light'}
									value={envFileContent}
								/>
							</TabsContent>
						</Tabs>
					</div>

					{showSettings && (
						<div className="border overflow-auto p-2 rounded" style={{ maxHeight: "60vh" }}>
							<SettingsPanel 
								settings={settings}
								onSettingsChange={(newSettings) => setSettings(newSettings)} 
							/>
						</div>
					)}
				</div>

				<AlertDialogFooter className="mt-4">
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleCopy}
					>
						{activeTab === "compose" ? "Copy Docker Compose" : "Copy Env File"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
} 