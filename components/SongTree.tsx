'use client'

import { useState, useCallback } from 'react'
import SongCard from './SongCard'
import { SongAnalysis } from '@/lib/types'

export interface TreeNode {
  songId:          string
  sessionId:       string
  analysis:        SongAnalysis
  depth:           number
  reason?:         string
  youtubeSearchUrl?: string
  recommendations?: TreeNode[]
  isExpanded:      boolean
  isLoadingRecs:   boolean
}

function Node({
  node, sessionId, totalSongs, onTotalChange, onUpdate,
}: {
  node: TreeNode
  sessionId: string
  totalSongs: number
  onTotalChange: (n: number) => void
  onUpdate: (n: TreeNode) => void
}) {
  const handleExpand = useCallback(async () => {
    // toggle collapse
    if (node.isExpanded) { onUpdate({ ...node, isExpanded: false }); return }
    // already fetched
    if (node.recommendations?.length) { onUpdate({ ...node, isExpanded: true }); return }
    // fetch
    onUpdate({ ...node, isLoadingRecs: true })
    try {
      const res  = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentSongId:   node.songId,
          sessionId,
          parentAnalysis: node.analysis,
          depth:          node.depth + 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const children: TreeNode[] = (data.recommendations || []).map((r: {
        songId: string; analysis: SongAnalysis; reason: string; youtubeSearchUrl: string
      }) => ({
        songId: r.songId, sessionId,
        analysis: r.analysis,
        depth: node.depth + 1,
        reason: r.reason,
        youtubeSearchUrl: r.youtubeSearchUrl,
        isExpanded: false, isLoadingRecs: false,
      }))

      onTotalChange(totalSongs + children.length)
      onUpdate({ ...node, recommendations: children, isExpanded: true, isLoadingRecs: false })
    } catch (e) {
      console.error(e)
      onUpdate({ ...node, isLoadingRecs: false })
    }
  }, [node, sessionId, totalSongs, onTotalChange, onUpdate])

  const updateChild = useCallback((i: number, updated: TreeNode) => {
    const recs = [...(node.recommendations || [])]
    recs[i] = updated
    onUpdate({ ...node, recommendations: recs })
  }, [node, onUpdate])

  return (
    <SongCard
      analysis={node.analysis}
      songId={node.songId}
      depth={node.depth}
      reason={node.reason}
      youtubeSearchUrl={node.youtubeSearchUrl}
      totalSongs={totalSongs}
      isExpanded={node.isExpanded}
      isLoadingRecs={node.isLoadingRecs}
      onExpand={handleExpand}
    >
      {node.isExpanded && node.recommendations && (
        <div className="space-y-4">
          {node.recommendations.map((child, i) => (
            <Node
              key={child.songId}
              node={child}
              sessionId={sessionId}
              totalSongs={totalSongs}
              onTotalChange={onTotalChange}
              onUpdate={u => updateChild(i, u)}
            />
          ))}
        </div>
      )}
    </SongCard>
  )
}

export default function SongTree({ root, sessionId, totalSongs, onTotalChange }: {
  root: TreeNode; sessionId: string; totalSongs: number; onTotalChange: (n: number) => void
}) {
  const [node, setNode] = useState<TreeNode>(root)
  return (
    <Node
      node={node}
      sessionId={sessionId}
      totalSongs={totalSongs}
      onTotalChange={onTotalChange}
      onUpdate={setNode}
    />
  )
}
