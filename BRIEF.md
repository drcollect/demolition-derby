# Demolition Derby — brief

Patrick wants a demolition derby game in the spirit of the 1995 PlayStation game *Destruction Derby*:
five cars built in Blender, driven in Three.js, that dent, lose glass and parts, and finally die; AI
opponents to smash into; a round stadium like the original's "Bowl"; and networked play later.

## What the original did (research, 2026-09-23)

*Destruction Derby* (Reflections Interactive / Psygnosis, 1995; PlayStation, Saturn, DOS):

- **Modes:** Wreckin' Racing (race + points for damage), Stock Car Racing (pure race), Destruction Derby
  and Time Trial. There is **only one derby arena, "the Bowl"**: a big circular concrete arena with no
  track, **20 cars** at once on PlayStation (16 on DOS).
- **Points:** spinning an opponent **90° = 2, 180° = 4, 360° = 10**; wrecking a car = **10**.
- **Damage** is located and depends on the speed and angle of the hit. Front hits break the
  **radiator**: the car overheats, and more front damage blows the engine and stops the car. Heavy rear
  damage takes away acceleration; damage in general limits steering and top speed. A damage display
  sits in the corner of the screen. Wreckage stays in the arena as an obstacle. "Polygonal debris".
- **Controls:** accelerate, brake, reverse, steer, cycle camera views (4 views), and a handbrake-style
  trick to spin the car round after being spun.
- **The manual's "Destruction Derby Code"** (these are the tactics the AI should know): brake hard when
  tailgated so the chaser eats front damage; turn into the rear corner of a car that overtakes you to
  spin it; ram cars that brake for a bend; squeeze cars into walls and wreckage; and when a car comes
  at you head-on, turn at the last moment so you take the hit on the side while it takes it on the nose.
- ***Destruction Derby 2*** (1996) added hoods flying off, fire, cars flipping and rolling, pit stops,
  and four bowls: Red Pike Arena, The Colosseum, **The Pit** (a hole in the middle that swallows cars)
  and **Death Bowl** (one side drops into a car crusher).

Sources: Wikipedia (*Destruction Derby*, *Destruction Derby 2*), the PlayStation Classic manual,
Lilura1's DOS review, Destruction Derby wiki (fandom).

## Our game

**Name:** Demolition Derby (working title; "Destruction Derby" is Sony's trademark).

**First arena — the Bowl:** a flat dirt floor 60 m across, a banked rim that cars can ride up and
slide back down, a concrete wall with a catch fence, and grandstands full of a cheering crowd under
floodlights at night.

**Round:** the player plus 7 AI cars (up to 11) start around the rim facing the middle. Last car
running wins; a time limit ends stalemates. Scoring follows the original: spins 2/4/10, wrecks 10.

**Damage model:**

- Four zones (front, rear, left, right) plus the four wheels. The HUD shows them on a top-down car
  outline, green to red.
- Front: steam, then smoke, then the engine loses power and dies (wrecked).
- Rear: loss of acceleration and top speed.
- Sides: steering pulls to the damaged side; a destroyed corner loses its wheel and drags on the
  ground in sparks.
- Visuals: dents where the car was hit, scraped paint, glass that cracks and then crazes, wings,
  splitters and mirrors that tear off, lights that go dark, smoke and finally fire.
- A wreck stays in the arena as an obstacle.

**The five cars** are Patrick's Collect Car models (built in Blender in `~/Collect Car`), prepared for
the game by `scripts/prepare_cars.py`, and each given its own livery:

| id | Car | Character |
|---|---|---|
| `hypercar` | Mid-engine hypercar, glowing wheel rings | Fastest, quickest, but fragile |
| `wedge` | 80s wedge supercar | All-rounder, tougher than it looks |
| `rally` | Desert rally truck, all-wheel drive | Heaviest and toughest, slower |
| `endurance` | Le Mans prototype | Best grip and handling, fragile aero parts |
| `streamliner` | Bubble streamliner, narrow rear track | Fast in a straight line, twitchy |

**Second venue — the Figure 8 (added 2026-09-23):** Patrick asked for a "cross race": a figure-eight
course where everyone races to be first, but the two straights cross, so cars keep meeting at the X
and knock each other out; laps plus a time limit, and a motocross feel with some ramps. (A figure-8
track is also what the original's racing modes were famous for crashing on.) Our version:

- Two banked loops joined by two straights crossing at 90°, a dusk sky, dirt, tyre walls on the outside
  of the loops and concrete jersey barriers elsewhere, open at the X.
- A roller jump just after the crossing on each straight. It's deliberately gentle: the straights are
  only 24 m past the X, and a big tabletop threw cars into the next loop upside down.
- 10 laps by default (3/5/10/15), 10-minute limit. The player starts at the back.
- Racing rules: flag for everyone once the winner finishes; cars thrown over a barrier, flipped or
  stuck are put back on the track; wrecks are towed to the infield. Wrecks still count, and a wrecked
  car is out of the race.
- Race AI: brakes for the loops (and early for the jumps, since there are no brakes in the air), passes
  slower cars and steers round stopped ones, and at the X judges who gets there first. Careful drivers
  lift; aggressive ones go for the T-bone. In a simulated 10-lap race, more than half of the car-to-car
  hits happened at the X.

**AI:** picks targets, leads them and aims for the rear corners to spin them, backs into cars to save
its radiator, turns its side into head-on attackers, pins cars against the wall, gets itself unstuck,
and gives up on wrecks. Personalities vary how aggressive and how careful each driver is.

**Networking (later):** the simulation runs at a fixed step and every car is driven by an input source
(keyboard, gamepad, AI, and later network). Damage is applied through discrete impact events, so a host
can send the events and every client can reproduce the same dents. The plan is host-authoritative play
over WebSocket/WebRTC with snapshot interpolation.

## Stack

Blender 5.2 (car preparation, by script) → glTF → Three.js r186 + Rapier 0.20 physics (a custom raycast
vehicle), Vite, TypeScript, and procedural WebAudio sound.
