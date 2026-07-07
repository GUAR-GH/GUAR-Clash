import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import BasePage from '@renderer/components/base/base-page'
import ProfileItem from '@renderer/components/profiles/profile-item'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { readTextFile } from '@renderer/utils/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { ClipboardPaste, FileDown, RefreshCcw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

const emptyItems: ProfileItem[] = []

function getProfileFromClipboardText(text: string): Partial<ProfileItem> | null {
  const value = text.trim()
  if (!value) return null

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'guar:') {
      const action = (parsed.host || parsed.pathname.replace(/^\/+/, '')).toLowerCase()
      if (action !== 'install-config') return null
      const url = parsed.searchParams.get('url')?.trim()
      if (!url) return null
      return {
        type: 'remote',
        url,
        name: parsed.searchParams.get('name')?.trim() || undefined
      }
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { type: 'remote', url: value }
    }
  } catch {
    return null
  }

  return null
}

const Profiles: React.FC = () => {
  const { t } = useTranslation()
  const {
    profileConfig,
    setProfileConfig,
    addProfileItem,
    updateProfileItem,
    removeProfileItem,
    changeCurrentProfile
  } = useProfileConfig()
  const { current, items } = profileConfig || {}
  const itemsArray = items ?? emptyItems
  const [sortedItems, setSortedItems] = useState(itemsArray)
  const [updating, setUpdating] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [clipboardImporting, setClipboardImporting] = useState(false)
  const [fileOver, setFileOver] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2
      }
    })
  )
  const pageRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const addProfileItemRef = useRef(addProfileItem)
  addProfileItemRef.current = addProfileItem
  const tRef = useRef(t)
  tRef.current = t

  const onDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        const newOrder = sortedItems.slice()
        const activeIndex = newOrder.findIndex((item) => item.id === active.id)
        const overIndex = newOrder.findIndex((item) => item.id === over.id)
        newOrder.splice(activeIndex, 1)
        newOrder.splice(overIndex, 0, itemsArray[activeIndex])
        setSortedItems(newOrder)
        await setProfileConfig({ current, items: newOrder })
      }
    }
  }

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setFileOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setFileOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounterRef.current = 0
    setFileOver(false)
    if (event.dataTransfer?.files) {
      const file = event.dataTransfer.files[0]
      if (
        file.name.endsWith('.yml') ||
        file.name.endsWith('.yaml') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.jsonc') ||
        file.name.endsWith('.json5') ||
        file.name.endsWith('.txt')
      ) {
        try {
          const path = window.api.webUtils.getPathForFile(file)
          const content = await readTextFile(path)
          await addProfileItemRef.current({ name: file.name, type: 'local', file: content })
        } catch (e) {
          toast.error(tRef.current('pages.profiles.fileImportFailed') + e)
        }
      } else {
        toast.error(tRef.current('pages.profiles.unsupportedFileType'))
      }
    }
  }, [])

  const handleImportFromClipboard = async (): Promise<void> => {
    setClipboardImporting(true)
    try {
      const text = await navigator.clipboard.readText()
      const item = getProfileFromClipboardText(text)
      if (!item) {
        toast.error(t('pages.profiles.clipboardImportInvalid'))
        return
      }
      await addProfileItem(item)
    } catch {
      toast.error(t('pages.profiles.clipboardReadFailed'))
    } finally {
      setClipboardImporting(false)
    }
  }

  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragenter', handleDragEnter)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)
    return (): void => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragenter', handleDragEnter)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop)
    }
  }, [handleDragOver, handleDragEnter, handleDragLeave, handleDrop])

  useEffect(() => {
    setSortedItems(itemsArray)
  }, [itemsArray])

  return (
    <BasePage
      ref={pageRef}
      title={t('pages.profiles.title')}
      header={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                className="app-nodrag"
                variant="ghost"
                disabled={clipboardImporting}
                onClick={handleImportFromClipboard}
              >
                <ClipboardPaste className={`text-lg ${clipboardImporting ? 'animate-pulse' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('pages.profiles.addFromClipboard')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                className="app-nodrag"
                variant="ghost"
                onClick={async () => {
                  setUpdating(true)
                  for (const item of itemsArray) {
                    if (item.id === current) continue
                    if (item.type !== 'remote') continue
                    await addProfileItem(item)
                  }
                  const currentItem = itemsArray.find((item) => item.id === current)
                  if (currentItem && currentItem.type === 'remote') {
                    await addProfileItem(currentItem)
                  }
                  setUpdating(false)
                }}
              >
                <RefreshCcw className={`text-lg ${updating ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('pages.profiles.updateAll')}</TooltipContent>
          </Tooltip>
        </>
      }
    >
      {/* File drop overlay */}
      {fileOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-12 py-8">
            <FileDown className="size-10 text-primary" />
            <span className="text-sm font-medium text-primary">
              {t('pages.profiles.dropFileHint')}
            </span>
          </div>
        </div>
      )}

      {sortedItems.length === 0 ? (
        <div className="flex h-[calc(100vh-80px)] w-full items-center justify-center py-8">
          <div className="flex max-w-72 flex-col items-center gap-3 px-6 text-center">
            <h2 className="text-muted-foreground text-lg font-medium">{t('pages.profiles.emptyTitle')}</h2>
            <p className="text-muted-foreground/70 text-sm whitespace-pre-line">
              {t('pages.profiles.emptyDescription')}
            </p>
            <Button
              className="mt-2"
              disabled={clipboardImporting}
              onClick={handleImportFromClipboard}
            >
              <ClipboardPaste className="mr-2 size-4" />
              {t('pages.profiles.addFromClipboard')}
            </Button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mx-2 mb-2">
            <SortableContext
              items={sortedItems.map((item) => {
                return item.id
              })}
            >
              {sortedItems.map((item) => (
                <ProfileItem
                  key={item.id}
                  isCurrent={item.id === current}
                  addProfileItem={addProfileItem}
                  removeProfileItem={removeProfileItem}
                  updateProfileItem={updateProfileItem}
                  info={item}
                  switching={switching}
                  onClick={async () => {
                    setSwitching(true)
                    await changeCurrentProfile(item.id)
                    await new Promise((resolve) => setTimeout(resolve, 500))
                    setSwitching(false)
                  }}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      )}
    </BasePage>
  )
}

export default Profiles
