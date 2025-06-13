"use client"

import type * as React from "react"
import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, File, X, Send, Loader2 } from "lucide-react"

interface Message {
  id: number
  sender: "user" | "ai"
  text: string
  fullContent?: string // Hidden content that includes PDF text
}

interface UploadedFile {
  id: number
  name: string
  content: string
}

declare global {
  interface Window {
    pdfjsLib: any
  }
}

const ChatUI: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState<string>("")
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false)
  const [lastParsedContent, setLastParsedContent] = useState<string>("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfScriptLoaded = useRef<boolean>(false)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!pdfScriptLoaded.current) {
      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js"
        pdfScriptLoaded.current = true
      }
      document.body.appendChild(script)
    }
  }, [])

  const formatMessagesForAPI = () => {
    return messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.fullContent || msg.text }],
    }))
  }

  const sendMessage = async () => {
    if (!input.trim()) return

    // Combine user input with PDF content if available
    const visibleText = input
    const fullContent = lastParsedContent ? `${input}\n\nPDF Content:\n${lastParsedContent}` : input

    const userMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: visibleText,
      fullContent: fullContent,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsTyping(true)

    // Reset the last parsed content after using it
    setLastParsedContent("")

    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyC4MUEmNTu7QSxZta7tYa1RxUx-eFZx70M",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [...formatMessagesForAPI(), { role: "user", parts: [{ text: fullContent }] }],
          }),
        },
      )

      const data = await response.json()
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "AI could not generate a response."

      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: reply,
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: "Error: Failed to fetch AI response.",
      }
      setMessages((prev) => [...prev, aiMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file")
      return
    }

    setIsLoadingPdf(true)

    try {
      const fileReader = new FileReader()

      fileReader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer

        if (!window.pdfjsLib) {
          console.error("PDF.js library not loaded yet")
          setIsLoadingPdf(false)
          return
        }

        try {
          const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
          let fullText = ""

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map((item: any) => item.str).join(" ")
            fullText += pageText + "\n"
          }

          console.log("PDF Content:", fullText)

          // Store the parsed content for the next message
          setLastParsedContent(fullText)

          const newFile: UploadedFile = {
            id: Date.now(),
            name: file.name,
            content: fullText,
          }

          setUploadedFiles((prev) => [...prev, newFile])

          // Add a message to show file was uploaded
          const fileMessage: Message = {
            id: Date.now(),
            sender: "user",
            text: `Uploaded file: ${file.name}`,
          }

          setMessages((prev) => [...prev, fileMessage])
        } catch (error) {
          console.error("Error parsing PDF:", error)
        }

        setIsLoadingPdf(false)
      }

      fileReader.readAsArrayBuffer(file)
    } catch (error) {
      console.error("Error reading file:", error)
      setIsLoadingPdf(false)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (id: number) => {
    setUploadedFiles((prev) => {
      const fileToRemove = prev.find((file) => file.id === id)

      // If we're removing the file that corresponds to lastParsedContent, clear it
      if (fileToRemove && fileToRemove.content === lastParsedContent) {
        setLastParsedContent("")
      }

      return prev.filter((file) => file.id !== id)
    })
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-indigo-600 dark:from-violet-400 dark:to-indigo-400">
            AI Chat Assistant
          </h1>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Powered by Gemini</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden max-w-4xl w-full mx-auto p-4 md:p-6">
        {/* Chat Container */}
        <Card className="flex-1 overflow-hidden border-0 shadow-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl h-[calc(100vh-180px)]">
          <ScrollArea className="h-full p-4 md:p-6">
            <div className="space-y-6">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center p-6 text-slate-500 dark:text-slate-400">
                  <div className="text-lg font-medium mb-2">Welcome to AI Chat</div>
                  <p className="text-sm">Ask a question or upload a PDF to get started</p>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`rounded-2xl px-5 py-3 max-w-md shadow-sm ${
                        msg.sender === "user"
                          ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white"
                          : "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600"
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex justify-start"
                >
                  <div className="rounded-2xl px-5 py-3 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <span
                          className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></span>
                        <span
                          className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></span>
                        <span
                          className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></span>
                      </div>
                      <span className="text-sm text-slate-500 dark:text-slate-400">AI is thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {isLoadingPdf && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="flex justify-center"
                >
                  <div className="rounded-2xl px-5 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 text-amber-800 dark:text-amber-200 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Processing PDF...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </Card>

        {/* Uploaded Files */}
        <AnimatePresence>
          {uploadedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4"
            >
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl p-3 shadow-md border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Uploaded Files</div>
                  {lastParsedContent && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-2">
                      PDF content ready to send
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-center rounded-full px-3 py-1.5 text-xs border transition-colors ${
                        file.content === lastParsedContent
                          ? "bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700"
                          : "bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600"
                      } group hover:bg-slate-200 dark:hover:bg-slate-600`}
                    >
                      <File
                        className={`h-3.5 w-3.5 mr-1.5 ${
                          file.content === lastParsedContent
                            ? "text-violet-600 dark:text-violet-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      />
                      <span
                        className={`truncate max-w-[150px] ${
                          file.content === lastParsedContent
                            ? "text-violet-800 dark:text-violet-300"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="ml-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 opacity-70 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendMessage()
          }}
          className="mt-4 flex gap-2 items-center"
        >
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                lastParsedContent ? "Type your message (PDF content will be included)" : "Type your message..."
              }
              className={`pr-10 py-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 rounded-xl shadow-md ${
                lastParsedContent
                  ? "focus-visible:ring-violet-500 dark:focus-visible:ring-violet-400 border-violet-200 dark:border-violet-800"
                  : "focus-visible:ring-slate-500 dark:focus-visible:ring-slate-400"
              }`}
            />
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" ref={fileInputRef} />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingPdf}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
              aria-label="Upload PDF"
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="submit"
            disabled={isLoadingPdf || !input.trim()}
            className={`rounded-xl py-6 px-4 text-white shadow-md ${
              lastParsedContent
                ? "bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700"
                : "bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700"
            }`}
          >
            <Send className="h-5 w-5" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  )
}

export default ChatUI
