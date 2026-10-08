export type Venue = {
  id: string;
  name: string;
  location: string;
  capacity: string;
  starsRequired: number;
  description: string;
  badge: string;
  primaryColor: string;
  accentColor: string;
  pyroIntensity: number;
};

export const VENUES: Venue[] = [
  {
    id: "garage",
    name: "The Rehearsal Garage",
    location: "Suburban Underground",
    capacity: "50 fans",
    starsRequired: 0,
    description: "Where legends begin. Raw acoustics and concrete walls.",
    badge: "🏚️",
    primaryColor: "#8fd4c4",
    accentColor: "#c4a882",
    pyroIntensity: 1,
  },
  {
    id: "neon-club",
    name: "Neon Circuit Club",
    location: "Downtown Arcade District",
    capacity: "800 fans",
    starsRequired: 3,
    description: "Laser-lit club with pulsing bass and an energetic crowd.",
    badge: "🌆",
    primaryColor: "#e07a7a",
    accentColor: "#7ecfc0",
    pyroIntensity: 1.5,
  },
  {
    id: "music-hall",
    name: "Metropolis Music Hall",
    location: "City Center",
    capacity: "3,500 fans",
    starsRequired: 7,
    description: "Grand acoustics and brilliant spotlight rigs.",
    badge: "🏛️",
    primaryColor: "#8aa4c4",
    accentColor: "#e0b27a",
    pyroIntensity: 2,
  },
  {
    id: "amphitheater",
    name: "Sunburst Amphitheater",
    location: "Festival Grounds",
    capacity: "25,000 fans",
    starsRequired: 12,
    description: "Open-air festival stage under the stars.",
    badge: "🌅",
    primaryColor: "#ff9900",
    accentColor: "#ff0077",
    pyroIntensity: 3,
  },
  {
    id: "world-arena",
    name: "World Arena Stadium",
    location: "Global Tour Mainstage",
    capacity: "80,000 fans",
    starsRequired: 18,
    description: "The ultimate AAA stage with stadium pyrotechnics.",
    badge: "🏟️",
    primaryColor: "#00ffff",
    accentColor: "#ff00ff",
    pyroIntensity: 4,
  },
];

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_gig",
    title: "First Gig",
    description: "Complete your first track in any mode.",
    icon: "🎸",
  },
  {
    id: "overdrive_master",
    title: "Stage Overdrive",
    description: "Activate Overdrive mode during a performance.",
    icon: "⚡",
  },
  {
    id: "flawless_virtuoso",
    title: "Virtuoso",
    description: "Achieve 95% or higher accuracy on a track.",
    icon: "⭐",
  },
  {
    id: "century_streak",
    title: "100 Note Streak",
    description: "Reach a 100-note streak during a performance.",
    icon: "🔥",
  },
  {
    id: "tour_legend",
    title: "Tour Legend",
    description: "Unlock all 5 World Tour venues.",
    icon: "🏆",
  },
  {
    id: "guitar_hero",
    title: "String Master",
    description: "Complete a Backline Drive guitar arrangement.",
    icon: "🎼",
  },
  {
    id: "world_arena_rockstar",
    title: "Stadium Rockstar",
    description: "Perform at the World Arena Stadium.",
    icon: "🏟️",
  },
];

export function setSelectedVenue(venueId: string, currentData?: CareerData): CareerData {
  const data = currentData || loadCareerData();
  const next = { ...data, selectedVenueId: venueId };
  saveCareerData(next);
  return next;
}

export type CareerData = {
  songStars: Record<string, number>; // songId -> best stars
  unlockedAchievements: string[]; // achievementIds
  totalScore: number;
  selectedVenueId: string;
};

const CAREER_STORAGE_KEY = "midi-stage-career-v1";

export function loadCareerData(): CareerData {
  try {
    const raw = localStorage.getItem(CAREER_STORAGE_KEY);
    if (!raw) return { songStars: {}, unlockedAchievements: [], totalScore: 0, selectedVenueId: "garage" };
    const parsed = JSON.parse(raw);
    return {
      songStars: parsed.songStars || {},
      unlockedAchievements: Array.isArray(parsed.unlockedAchievements) ? parsed.unlockedAchievements : [],
      totalScore: Number(parsed.totalScore) || 0,
      selectedVenueId: parsed.selectedVenueId || "garage",
    };
  } catch {
    return { songStars: {}, unlockedAchievements: [], totalScore: 0, selectedVenueId: "garage" };
  }
}

export function saveCareerData(data: CareerData): boolean {
  try {
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function getTotalStars(data: CareerData): number {
  return Object.values(data.songStars).reduce((sum, stars) => sum + (Number(stars) || 0), 0);
}

export function getUnlockedVenues(totalStars: number): Venue[] {
  return VENUES.filter((venue) => totalStars >= venue.starsRequired);
}

export function checkNewAchievements(
  currentData: CareerData,
  session: {
    songId: string;
    accuracy: number;
    stars: number;
    score: number;
    maxCombo: number;
    overdriveActivated: boolean;
    isGuitar: boolean;
  },
): { updatedData: CareerData; newlyUnlocked: Achievement[] } {
  const nextData: CareerData = {
    songStars: { ...currentData.songStars },
    unlockedAchievements: [...currentData.unlockedAchievements],
    totalScore: currentData.totalScore + session.score,
    selectedVenueId: currentData.selectedVenueId || "garage",
  };

  if (session.stars > (nextData.songStars[session.songId] || 0)) {
    nextData.songStars[session.songId] = session.stars;
  }

  const newlyUnlocked: Achievement[] = [];

  const grant = (id: string) => {
    if (!nextData.unlockedAchievements.includes(id)) {
      nextData.unlockedAchievements.push(id);
      const ach = ACHIEVEMENTS.find((a) => a.id === id);
      if (ach) newlyUnlocked.push(ach);
    }
  };

  grant("first_gig");
  if (session.overdriveActivated) grant("overdrive_master");
  if (session.accuracy >= 95) grant("flawless_virtuoso");
  if (session.maxCombo >= 100) grant("century_streak");
  if (session.isGuitar) grant("guitar_hero");

  const starsNow = getTotalStars(nextData);
  if (starsNow >= VENUES[VENUES.length - 1]!.starsRequired) {
    grant("tour_legend");
  }
  if (nextData.selectedVenueId === "world-arena") {
    grant("world_arena_rockstar");
  }

  saveCareerData(nextData);
  return { updatedData: nextData, newlyUnlocked };
}
