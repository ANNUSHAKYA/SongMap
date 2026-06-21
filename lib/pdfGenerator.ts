import { jsPDF } from 'jspdf'
import { SongAnalysis } from './types'

interface SessionSong {
  id: string
  parentId: string | null
  depth: number
  analysis: SongAnalysis
  reason?: string
}

export function generatePDF(sessionSongs: SessionSong[], seedSong?: SessionSong, sessionId?: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageHeight = doc.internal.pageSize.getHeight() // 297 mm
  const pageWidth = doc.internal.pageSize.getWidth() // 210 mm
  
  const marginL = 15
  const marginR = 15
  const marginB = 20
  const contentWidth = pageWidth - marginL - marginR // 180 mm

  let pageNum = 1

  // Draw header and page numbers
  const drawPageDecorations = (pNum: number) => {
    // Top border line
    doc.setFillColor(74, 186, 148) // #4ABA94 Green
    doc.rect(0, 0, pageWidth, 4, 'F')

    // Bottom page number
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(104, 91, 83) // Charcoal secondary
    doc.text(`Page ${pNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
    
    // Tiny footer branding
    doc.text('SongMap — Beat DNA Recommendation Report', marginL, pageHeight - 10)
  }

  // Draw Table Headers
  const drawTableHeader = (startY: number): number => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(43, 58, 57) // Dark charcoal #2B3A39

    // Headers
    doc.text('#', marginL, startY)
    doc.text('Song Title / Artist', marginL + 8, startY)
    doc.text('BPM / Key / Mood', marginL + 58, startY)
    doc.text('DNA Recommendation Reason', marginL + 98, startY)
    doc.text('Links', marginL + 158, startY)

    // Divider line
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.2)
    doc.line(marginL, startY + 2, pageWidth - marginR, startY + 2)

    return startY + 6
  }

  // 1. Draw Page 1 Title Section
  drawPageDecorations(pageNum)
  
  let y = 15

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(43, 58, 57)
  doc.text('SongMap', marginL, y)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(74, 186, 148)
  doc.text('BEAT DNA RECOMMENDATION REPORT', marginL, y + 5)

  // Report Info
  doc.setFontSize(8)
  doc.setTextColor(104, 91, 83)
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
  doc.text(`Generated: ${dateStr}`, pageWidth - marginR, y, { align: 'right' })
  if (sessionId) {
    doc.text(`Session ID: ${sessionId}`, pageWidth - marginR, y + 4, { align: 'right' })
  }

  y += 12

  // Seed Song details box (if available)
  if (seedSong) {
    doc.setFillColor(255, 248, 225) // Light background #fff8e1
    doc.setDrawColor(74, 186, 148, 0.2)
    doc.roundedRect(marginL, y, contentWidth, 22, 2, 2, 'FD')

    // Seed title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(43, 58, 57)
    doc.text('Seed Track Beat DNA:', marginL + 5, y + 6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`${seedSong.analysis.title} — ${seedSong.analysis.artist}`, marginL + 5, y + 13)

    // Seed attributes
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(104, 91, 83)
    
    const details = [
      `Tempo: ${seedSong.analysis.bpm} BPM`,
      `Key: ${seedSong.analysis.keySignature}`,
      `Time Sig: ${seedSong.analysis.timeSignature}`,
      `Mood: ${seedSong.analysis.mood}`,
      `Energy: ${seedSong.analysis.energyLevel.toUpperCase()}`
    ]
    doc.text(details.join('  |  '), marginL + 5, y + 18)
    y += 28
  } else {
    y += 4
  }

  // Draw Table Header
  y = drawTableHeader(y)

  // Recommended list of songs
  doc.setFontSize(8.5)
  
  sessionSongs.forEach((song, index) => {
    // Text values
    const idxText = `${index + 1}`
    const titleVal = song.analysis.title || 'Untitled'
    const artistVal = song.analysis.artist || 'Unknown Artist'
    const bpmVal = `${song.analysis.bpm} BPM`
    const keyVal = song.analysis.keySignature || 'Unknown Key'
    const moodVal = song.analysis.mood || 'Unknown Mood'
    
    // Recommendation Reason
    const reasonText = song.reason || song.analysis.analysisText || 'Similar beat DNA and rhythmic structure.'

    // Links
    const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(artistVal + ' ' + titleVal)}`
    const youtubeUrl = song.analysis.youtubeUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(artistVal + ' ' + titleVal + ' official')}`

    // Word Wrap calculations
    const titleLines = doc.splitTextToSize(`${titleVal}\nby ${artistVal}`, 46)
    const attrLines = doc.splitTextToSize(`${bpmVal}\n${keyVal}\n${moodVal}`, 36)
    const reasonLines = doc.splitTextToSize(reasonText, 56)

    // Calculate Row Height
    const textHeight = Math.max(
      titleLines.length * 4,
      attrLines.length * 4,
      reasonLines.length * 4,
      8 // min height for URLs column
    )
    const padding = 6
    const rowHeight = textHeight + padding

    // Page Break check
    if (y + rowHeight > pageHeight - marginB) {
      doc.addPage()
      pageNum++
      drawPageDecorations(pageNum)
      y = drawTableHeader(20)
    }

    // Row Background (zebra striping for readability)
    if (index % 2 === 1) {
      doc.setFillColor(248, 248, 245)
      doc.rect(marginL, y - 4, contentWidth, rowHeight, 'F')
    }

    // Print values
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(43, 58, 57)

    // 1. Index
    doc.text(idxText, marginL, y)

    // 2. Song & Artist
    let titleY = y
    titleLines.forEach((line: string, i: number) => {
      if (i === 0) {
        doc.setFont('helvetica', 'bold')
      } else {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(104, 91, 83)
      }
      doc.text(line, marginL + 8, titleY)
      titleY += 4
    })

    // Reset styles
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(43, 58, 57)

    // 3. Attributes
    let attrY = y
    attrLines.forEach((line: string) => {
      doc.text(line, marginL + 58, attrY)
      attrY += 4
    })

    // 4. Reason
    let reasonY = y
    reasonLines.forEach((line: string) => {
      doc.text(line, marginL + 98, reasonY)
      reasonY += 4
    })

    // 5. Clickable Links
    // Spotify link
    doc.setTextColor(74, 186, 148) // Green accent #4ABA94
    doc.setFont('helvetica', 'bold')
    doc.text('Spotify', marginL + 158, y, { link: { url: spotifyUrl } } as any)
    
    // YouTube link
    doc.setTextColor(208, 84, 45) // Orange/Red #D0542D
    doc.text('YouTube', marginL + 158, y + 4.5, { link: { url: youtubeUrl } } as any)

    // Divider below row
    doc.setDrawColor(240, 240, 240)
    doc.line(marginL, y + rowHeight - 4, pageWidth - marginR, y + rowHeight - 4)

    y += rowHeight
  })

  // Save the PDF
  const filename = `SongMap-Report-${seedSong ? seedSong.analysis.title.replace(/\s+/g, '-') : 'Discovery'}.pdf`
  doc.save(filename)
}
