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
import Head from "next/head"

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

  // Add a useEffect to handle viewport height for mobile browsers
  useEffect(() => {
    // Fix for mobile viewport height issues
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
    
    return () => {
      window.removeEventListener('resize', setVH);
    };
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <div className="min-h-screen w-full flex items-center justify-center bg-white sm:bg-gray-50 sm:p-0" 
           style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
        <div className="flex flex-col justify-between w-full h-full sm:h-auto sm:max-w-xl sm:p-6 p-4 gap-3 bg-white sm:rounded-lg sm:shadow-md">
          
          {/* Sequencer Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-8 items-stretch justify-stretch gap-3 h-full">
            {sequences[activeTrack].map((active, index) => (
              <div
                key={index}
                className="touch-manipulation h-16 sm:h-12">
                <Checkbox
                  checked={active}
                  onCheckedChange={() => toggleStep(index)}
                  className={`
                    relative rounded-smm w-full h-16 sm:h-12
                    transition-all duration-150
                    ${!active && currentStep === index ? 'border-[3px]' : 'border-black/10'}
                    ${!active ? 'bg-gray-50' : ''}
                    active:scale-95
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
          <div className="grid grid-cols-4 sm:grid-cols-8 items-stretch justify-stretch gap-3 h-full">
            {tones.map((_, index) => {
              const hasSequence = sequences[index].some(step => step)
              const isCurrentlyPlaying = isTrackPlaying(index)
              const isActive = activeTrack === index
              
              return (
                <Button
                  key={index}
                  variant={isActive ? "default" : "outline"}
                  className={`
                    relative h-16 sm:h-12 w-full rounded-sm
                    transition-all duration-150
                    border-1
                    hover:scale-[1.02]
                    active:scale-95
                    border-black/10
                    touch-manipulation
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
                    if (!isPlaying) {
                      playTone(index)
                    }
                  }}
                >
                  {/* Note Display */}
                  <span className="text-sm font-medium">
                    {index + 1}
                  </span>
                </Button>
              )
            })}
          </div>

          {/* Updated buttons section with volume control */}
          <TooltipProvider>
            <div className="grid grid-cols-4 sm:grid-cols-8 items-stretch justify-stretch gap-3 mt-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => setIsPlaying(!isPlaying)} 
                    className={`h-16 sm:h-12 w-full rounded-sm touch-manipulation active:scale-95`}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>{isPlaying ? 'Pause' : 'Play'}</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleRandom} 
                    variant="outline" 
                    className="h-16 sm:h-12 w-full rounded-sm touch-manipulation active:scale-95"
                  >
                    <Shuffle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Random Pattern</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleClear} 
                    variant="outline" 
                    className="h-16 sm:h-12 w-full rounded-sm touch-manipulation active:scale-95"
                  >
                    <FileX className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Clear All</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu open={volumeOpen} onOpenChange={setVolumeOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="h-16 sm:h-12 w-full rounded-sm touch-manipulation active:scale-95"
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        className="flex items-center p-4 h-14 shadow-none border rounded-sm" 
                        side="bottom"
                        sideOffset={8}
                      >
                        <div onMouseLeave={() => setVolumeOpen(false)} onTouchEnd={() => setVolumeOpen(false)}>
                        <Slider
                          value={[masterVolume * 100]}
                          onValueChange={(value) => setMasterVolume(value[0] / 100)}
                          min={0}
                          max={100}
                          step={1}
                          className="w-40 sm:w-32"
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
    </>
  )
}

