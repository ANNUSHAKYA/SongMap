'use client'

import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  NodeProps,
  Handle,
  Position,
  Node,
  Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Image from 'next/image'
import { Music, Play } from 'lucide-react'
import { useTheme } from './ThemeContext'

type SongNode = Node<{
  song: {
    id: string
    parentId: string | null
    depth: number
    analysis: {
      title: string
      artist: string
      bpm: number
      energyLevel: 'low' | 'medium' | 'high'
      albumArt?: string
      genre: string[]
    }
  }
  isActive: boolean
  onSelect: (songId: string) => void
}, 'songNode'>

// Custom Node component
function SongNodeComponent({ data }: NodeProps<SongNode>) {
  const { song, isActive, onSelect } = data
  const { theme } = useTheme()

  const energyColors = {
    low: 'border-[#4ABA94] shadow-[#4ABA94]/10',
    medium: 'border-[#D0542D] shadow-[#D0542D]/10',
    high: 'border-[#B84420] shadow-[#B84420]/10',
  }

  const borderClass = energyColors[song.analysis.energyLevel] || 'border-[#4ABA94]'

  // Generate cover art gradient based on title + artist if no albumArt exists
  const fallbackGradient = useMemo(() => {
    const hash = (song.analysis.title + song.analysis.artist).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const hue1 = hash % 360
    const hue2 = (hash + 60) % 360
    return `linear-gradient(135deg, hsl(${hue1}, 75%, 60%), hsl(${hue2}, 70%, 45%))`
  }, [song.analysis.title, song.analysis.artist])

  return (
    <div
      onClick={() => onSelect(song.id)}
      className={`group relative flex items-center gap-3 px-4 py-2.5 rounded-full border-2 cursor-pointer transition-all duration-300 select-none
        ${isActive 
          ? 'bg-[#4ABA94]/15 border-[#4ABA94] scale-105 shadow-lg' 
          : 'bg-[var(--c-card-bg)] border-opacity-40 hover:border-opacity-100 hover:scale-102 shadow-md dark:bg-[var(--c-card-bg)]'
        } ${borderClass}`}
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      {/* Handles */}
      {song.parentId && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: '#4ABA94', border: '1px solid var(--c-bg)', width: 8, height: 8 }}
        />
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#4ABA94', border: '1px solid var(--c-bg)', width: 8, height: 8 }}
      />

      {/* Album Art / Cover Circle */}
      <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-neutral-200 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center shadow-inner">
        {song.analysis.albumArt ? (
          <Image
            src={song.analysis.albumArt}
            alt={song.analysis.title}
            width={36}
            height={36}
            className={`object-cover w-full h-full transition-transform duration-500 group-hover:scale-110 ${isActive ? 'animate-spin-slow' : ''}`}
            unoptimized
          />
        ) : (
          <div 
            style={{ background: fallbackGradient }}
            className={`w-full h-full flex items-center justify-center text-white ${isActive ? 'animate-spin-slow' : ''}`}
          >
            <Music size={14} />
          </div>
        )}
        {isActive && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Play size={12} className="text-white fill-white" />
          </div>
        )}
      </div>

      {/* Song details */}
      <div className="flex-1 min-w-0 pr-1">
        <div 
          className={`font-semibold truncate text-[13px] leading-tight transition-colors duration-200 
            ${isActive ? 'text-[#3A9478] dark:text-[#64D3B0]' : 'text-[#2B3A39] dark:text-[#E2F5F0]'}`}
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          {song.analysis.title}
        </div>
        <div className="text-[11px] text-[#685B53] dark:text-[#92A8A5] truncate leading-none mt-0.5">
          {song.analysis.artist}
        </div>
      </div>

      {/* BPM Badge */}
      <div className="flex-shrink-0 text-[10px] font-mono font-bold bg-[#D0542D]/10 text-[#D0542D] border border-[#D0542D]/20 px-1.5 py-0.5 rounded">
        {song.analysis.bpm}
      </div>
    </div>
  )
}

const nodeTypes = {
  songNode: SongNodeComponent,
}

interface SongFlowGraphProps {
  songs: Array<{
    id: string
    parentId: string | null
    depth: number
    analysis: any
  }>
  activeSongId: string | null
  onSelectSong: (songId: string) => void
}

export default function SongFlowGraph({ songs, activeSongId, onSelectSong }: SongFlowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { theme } = useTheme()

  // Layout the tree structure using a simple recursion
  useEffect(() => {
    if (songs.length === 0) return

    // 1. Build adjacency list and nodes map
    const adjList = new Map<string, string[]>()
    const nodesMap = new Map<string, any>()
    let rootId: string | null = null

    songs.forEach(song => {
      nodesMap.set(song.id, song)
      if (song.parentId) {
        const list = adjList.get(song.parentId) || []
        list.push(song.id)
        adjList.set(song.parentId, list)
      } else {
        rootId = song.id
      }
    })

    // If no explicit root (should not happen), take the first one with minimum depth
    if (!rootId && songs.length > 0) {
      const sorted = [...songs].sort((a, b) => a.depth - b.depth)
      rootId = sorted[0].id
    }

    if (!rootId) return

    const layoutedNodes: Node[] = []
    const layoutedEdges: Edge[] = []
    const SPACING_X = 280
    const SPACING_Y = 160

    // Recursive layout helper
    function layout(
      nodeId: string,
      x: number,
      y: number,
      spacingX: number
    ) {
      const song = nodesMap.get(nodeId)
      if (!song) return

      layoutedNodes.push({
        id: nodeId,
        type: 'songNode',
        data: {
          song,
          isActive: nodeId === activeSongId,
          onSelect: onSelectSong,
        },
        position: { x, y },
      })

      const children = adjList.get(nodeId) || []
      const nChildren = children.length
      if (nChildren === 0) return

      const nextSpacingX = Math.max(spacingX * 0.85, 140)
      const startX = x - ((nChildren - 1) / 2) * spacingX

      children.forEach((childId, idx) => {
        const childX = startX + idx * spacingX
        const childY = y + SPACING_Y

        layoutedEdges.push({
          id: `e-${nodeId}-${childId}`,
          source: nodeId,
          target: childId,
          animated: childId === activeSongId || nodeId === activeSongId,
          style: {
            stroke: childId === activeSongId ? '#D0542D' : '#4ABA94',
            strokeWidth: childId === activeSongId ? 3.5 : 2.5,
          },
          type: 'smoothstep',
        })

        layout(childId, childX, childY, nextSpacingX)
      })
    }

    // Run layout from root at x=0, y=20
    layout(rootId, 0, 20, SPACING_X)

    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [songs, activeSongId, onSelectSong, setNodes, setEdges])

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} className="dark:bg-[var(--c-card-bg)]" />
        <MiniMap
          nodeColor={(n) => {
            if (n.id === activeSongId) return '#D0542D'
            return '#4ABA94'
          }}
          maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'}
          style={{
            background: 'var(--c-card-bg)',
            border: '1.5px solid var(--c-border)',
            borderRadius: 8,
          }}
          className="dark:border-[var(--c-border)]"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  )
}
