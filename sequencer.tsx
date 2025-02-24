"use client"

import { useState, useEffect, useRef } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, Settings, Shuffle, FileX, Volume2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import * as Tone from "tone"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const STEPS = 16
const LYDIAN_SCALE = [
  // First octave (3)
  { note: 'C3', freq: 130.81 },
  { note: 'D3', freq: 146.83 },
  { note: 'E3', freq: 164.81 },
  { note: 'F#3', freq: 185.00 },
  { note: 'G3', freq: 196.00 },
  { note: 'A3', freq: 220.00 },
  { note: 'B3', freq: 246.94 },
  // Second octave (4)
  { note: 'C4', freq: 261.63 },
  { note: 'D4', freq: 293.66 },
  { note: 'E4', freq: 329.63 },
  { note: 'F#4', freq: 369.99 },
  { note: 'G4', freq: 392.00 },
  { note: 'A4', freq: 440.00 },
  { note: 'B4', freq: 493.88 },
  // Third octave (5)
  { note: 'C5', freq: 523.25 },
  { note: 'D5', freq: 587.33 },
  { note: 'E5', freq: 659.26 },
  { note: 'F#5', freq: 739.99 },
  { note: 'G5', freq: 783.99 },
  { note: 'A5', freq: 880.00 },
  { note: 'B5', freq: 987.77 }
]
const DEFAULT_TONES = LYDIAN_SCALE.slice(0, 8).map(n => n.freq)
const TRACK_COLORS = [
  "#ef4444",  // red-500
  "#3b82f6",  // blue-500
  "#eab308",  // yellow-500
  "#14b8a6",  // teal-500
  "#a855f7",  // purple-500
  "#f97316",  // orange-500
  "#22c55e",  // green-500
  "#ec4899",  // pink-500 (changed from magenta for better Tailwind compatibility)
]

export default function Sequencer() {
  const [sequences, setSequences] = useState<boolean[][]>(
    Array(DEFAULT_TONES.length).fill(null).map(() => Array(STEPS).fill(false))
  )
  const [activeTrack, setActiveTrack] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(118)
  const [currentStep, setCurrentStep] = useState(0)
  const [reverb, setReverb] = useState(0.3)
  const [delay, setDelay] = useState(0.15)
  const [masterVolume, setMasterVolume] = useState(0.5)
  const synthsRef = useRef<Tone.Synth[]>([])
  const reverbRef = useRef<Tone.Reverb | null>(null)
  const delayRef = useRef<Tone.PingPongDelay | null>(null)
  const limiterRef = useRef<Tone.Limiter | null>(null)
  const volumeRef = useRef<Tone.Volume | null>(null)
  const [selectedNotes, setSelectedNotes] = useState<string[]>(
    LYDIAN_SCALE.slice(0, 8).map(n => n.note)
  )
  const [tones, setTones] = useState<number[]>(DEFAULT_TONES)
  const [isVolumeExpanded, setIsVolumeExpanded] = useState(false)
  const volumeTimeoutRef = useRef<NodeJS.Timeout>()
  const [volumeOpen, setVolumeOpen] = useState(false)

  useEffect(() => {
    // Initialize Tone.js components
    limiterRef.current = new Tone.Limiter(-6).toDestination() // -6dB threshold

    volumeRef.current = new Tone.Volume(masterVolume)
      .connect(limiterRef.current)

    delayRef.current = new Tone.PingPongDelay({
      delayTime: 0.25,
      feedback: 0.2,
      wet: delay
    }).connect(volumeRef.current)

    reverbRef.current = new Tone.Reverb({
      decay: 2.5,
      wet: reverb
    }).connect(delayRef.current)

    // Create a synth for each track with reduced initial volume
    synthsRef.current = DEFAULT_TONES.map(() => 
      new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.005,
          decay: 0.3,
          sustain: 0.01,
          release: 0.01
        },
        volume: -12,
        portamento: 0.5
      }).connect(reverbRef.current || limiterRef.current!)
    )

    return () => {
      limiterRef.current?.dispose()
      volumeRef.current?.dispose()
      delayRef.current?.dispose()
      reverbRef.current?.dispose()
      synthsRef.current.forEach(synth => synth.dispose())
    }
  }, [])

  // Update reverb when slider changes
  useEffect(() => {
    if (reverbRef.current) {
      reverbRef.current.wet.value = reverb
    }
  }, [reverb])

  // Add effect for delay control
  useEffect(() => {
    if (delayRef.current) {
      delayRef.current.wet.value = delay
    }
  }, [delay])

  // Add volume control effect
  useEffect(() => {
    if (volumeRef.current) {
      volumeRef.current.volume.value = Tone.gainToDb(masterVolume)
    }
  }, [masterVolume])

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null
    if (isPlaying) {
      const beatDuration = 60 / bpm // Duration of one beat in seconds
      const stepDuration = (beatDuration * 4) / 16 // Duration of one step in seconds
      
      intervalId = setInterval(
        () => {
          setCurrentStep((prev) => (prev + 1) % STEPS)
        },
        stepDuration * 1000, // Convert to milliseconds
      )
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [isPlaying, bpm])

  useEffect(() => {
    if (isPlaying) {
      sequences.forEach((trackSequence, trackIndex) => {
        if (trackSequence[currentStep]) {
          playTone(trackIndex)
        }
      })
    }
  }, [currentStep, isPlaying, sequences])

  const toggleStep = (index: number) => {
    setSequences(prev => {
      const newSequences = [...prev]
      newSequences[activeTrack] = [...prev[activeTrack]]
      newSequences[activeTrack][index] = !newSequences[activeTrack][index]
      return newSequences
    })
  }

  const playTone = (index: number) => {
    if (synthsRef.current[index]) {
      const now = Tone.now()
      synthsRef.current[index].triggerAttackRelease(tones[index], "8n", now)
    }
  }

  // Add this helper function to check if a track is currently playing
  const isTrackPlaying = (trackIndex: number) => {
    return isPlaying && sequences[trackIndex][currentStep]
  }

  const handleNoteSelect = (padIndex: number, note: string) => {
    const noteData = LYDIAN_SCALE.find(n => n.note === note)
    if (!noteData) return

    setSelectedNotes(prev => {
      const next = [...prev]
      next[padIndex] = note
      return next
    })

    setTones(prev => {
      const next = [...prev]
      next[padIndex] = noteData.freq
      return next
    })
  }

  const handleRandom = () => {
    // Create semi-controlled random patterns
    setSequences(prev => prev.map((_, trackIndex) => {
      const newPattern = Array(STEPS).fill(false)
      
      // Different probability patterns for different types of tracks
      const isBaseTrack = trackIndex < 2  // Bass/rhythm tracks
      const isMidTrack = trackIndex >= 2 && trackIndex < 7  // Mid-range tracks
      const isHighTrack = trackIndex >= 7  // High tracks

      for (let i = 0; i < STEPS; i++) {
        const isDownbeat = i % 4 === 0
        const isUpbeat = i % 4 === 2
        
        let probability = 0.000001

        // Probabilities for different tracks
        if (isBaseTrack) {
          probability = isDownbeat ? 0.3 : isUpbeat ? 0.1 : 0.05
        } else if (isMidTrack) {
          probability = isDownbeat ? 0.13 : 0.07
        } else if (isHighTrack) {
          probability = isDownbeat ? 0.09 : 0.017
        }

        if (i > 0 && newPattern[i - 1]) {
          probability *= 0.23
        }
        if (i > 1 && newPattern[i - 1] && newPattern[i - 2]) {
          probability *= 0.17
        }

        newPattern[i] = Math.random() < probability
      }

      // Ensure at least one hit per track
      if (!newPattern.some(step => step)) {
        const downbeats = [0, 4, 8, 12]
        const randomDownbeat = downbeats[Math.floor(Math.random() * downbeats.length)]
        newPattern[randomDownbeat] = true
      }

      return newPattern
    }))

    // Note selection remains the same
    const randomNotes = Array(8).fill(null).map((_, index) => {
      let noteRange
      if (index < 2) {
        noteRange = LYDIAN_SCALE.slice(0, 10)
      } else if (index < 5) {
        noteRange = LYDIAN_SCALE.slice(4, 17)
      } else {
        noteRange = LYDIAN_SCALE.slice(11)
      }

      const unusedNotes = noteRange.filter(note => 
        !selectedNotes.includes(note.note) || Math.random() > 0.7
      )

      const notePool = unusedNotes.length > 0 ? unusedNotes : noteRange
      return notePool[Math.floor(Math.random() * notePool.length)]
    })

    setSelectedNotes(randomNotes.map(note => note.note))
    setTones(randomNotes.map(note => note.freq))
  }

  const handleClear = () => {
    // Clear all patterns
    setSequences(Array(DEFAULT_TONES.length).fill(null).map(() => Array(STEPS).fill(false)))
  }

  const handleVolumeInteraction = () => {
    setIsVolumeExpanded(true)
    clearTimeout(volumeTimeoutRef.current)
    volumeTimeoutRef.current = setTimeout(() => {
      setIsVolumeExpanded(false)
    }, 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-6 max-w-xl">
        {/* Sequencer Grid */}
        <div className="grid grid-cols-8 gap-2 mb-3">
          {sequences[activeTrack].map((active, index) => (
            <div
              key={index}
              className="flex">
              <Checkbox
                checked={active}
                onCheckedChange={() => toggleStep(index)}
                className={`
                  relative h-12 w-12 rounded-r-full
                  transition-all duration-150
                  ${!active && currentStep === index ? 'border-[3px]' : 'border-black/10'}
                `}
                style={{
                  borderColor: active 
                    ? "transparent" 
                    : currentStep === index 
                      ? TRACK_COLORS[activeTrack]
                      : undefined,
                  backgroundColor: active ? TRACK_COLORS[activeTrack] : undefined
                }}
              />
            </div>
          ))}
        </div>

        {/* Modified Tone Trigger Buttons */}
        <div className="grid grid-cols-8 gap-2 mb-3">
          {tones.map((_, index) => {
            const hasSequence = sequences[index].some(step => step)
            const isCurrentlyPlaying = isTrackPlaying(index)
            const isActive = activeTrack === index
            
            return (
              <Button
                key={index}
                variant={isActive ? "default" : "outline"}
                className={`
                  relative w-12 h-12 rounded-l-full
                  transition-all duration-150
                  border-1
                  hover:scale-[1.02]
                  border-black/10
                  ${isActive ? 'scale-[1.02] text-white' : ''}
                  ${isCurrentlyPlaying ? 'border-[4px]' : ''}
                `}
                style={{
                  borderColor: isCurrentlyPlaying ? TRACK_COLORS[index] : undefined,
                  backgroundColor: isActive ? TRACK_COLORS[index] : undefined,
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  setActiveTrack(index)
                  playTone(index)
                }}
              >
                {/* Pad Number
                <span className="absolute top-1 left-2 text-xs">
                  {index + 1}
                </span>
                */}

                {/* Note Display */}
                <span className="text-xs">
                  {/*{selectedNotes[index]}*/}
                  {index + 1}
                </span>
              

                {/* Settings Dropdown 
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div 
                      className="absolute top-1 right-1 p-2 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Settings className="h-3 w-3" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {LYDIAN_SCALE.map((noteData) => (
                      <DropdownMenuItem
                        key={noteData.note}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNoteSelect(index, noteData.note)
                        }}
                        disabled={selectedNotes.includes(noteData.note) && selectedNotes[index] !== noteData.note}
                      >
                        {noteData.note}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                */}
              </Button>
            )
          })}
        </div>
        {/*
        {/* Controls Accordion
        <Accordion type="single" collapsible className="mb-4">
          <AccordionItem value="controls">
            <AccordionTrigger className="text-lg">Controls</AccordionTrigger>
            <AccordionContent>
              {/* BPM Control
              <div className="flex items-center mb-4">
                <div className="bg-black text-green-500 font-mono text-xl p-2 mr-4 w-20 text-center">{bpm}</div>
                <Slider
                  value={[bpm]}
                  onValueChange={(value) => setBpm(value[0])}
                  min={60}
                  max={240}
                  step={1}
                  className="w-64"
                />
                <span className="ml-2 font-mono">BPM</span>
              </div>

              {/* Reverb Control
              <div className="flex items-center mb-4">
                <div className="bg-black text-green-500 font-mono text-xl p-2 mr-4 w-20 text-center">
                  {(reverb * 100).toFixed(0)}%
                </div>
                <Slider
                  value={[reverb * 100]}
                  onValueChange={(value) => setReverb(value[0] / 100)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-64"
                />
                <span className="ml-2 font-mono">REVERB</span>
              </div>

              {/* Delay Control
              <div className="flex items-center mb-4">
                <div className="bg-black text-green-500 font-mono text-xl p-2 mr-4 w-20 text-center">
                  {(delay * 100).toFixed(0)}%
                </div>
                <Slider
                  value={[delay * 100]}
                  onValueChange={(value) => setDelay(value[0] / 100)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-64"
                />
                <span className="ml-2 font-mono">DELAY</span>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        */}

        {/* Updated buttons section with volume control */}
        <TooltipProvider>
          <div className="grid grid-cols-4 gap-2 w-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-l-full">
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{isPlaying ? 'Pause' : 'Play'}</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleRandom} variant="outline" className="w-12 h-12 rounded-l-full">
                  <Shuffle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Random Pattern</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleClear} variant="outline" className="w-12 h-12 rounded-l-full">
                  <FileX className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Clear All</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu open={volumeOpen} onOpenChange={setVolumeOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-12 h-12 rounded-l-full">
                        <Volume2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      className="flex items-center p-4 h-12 shadow-none border rounded-r-full" 
                      side="right"
                      sideOffset={8}
                    >
                      <div onMouseLeave={() => setVolumeOpen(false)}>
                      <Slider
                        value={[masterVolume * 100]}
                        onValueChange={(value) => setMasterVolume(value[0] / 100)}
                        min={0}
                        max={100}
                        step={1}
                        className="w-24"
                      />
                      </div>
                    </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent><p>Volume</p></TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
}

