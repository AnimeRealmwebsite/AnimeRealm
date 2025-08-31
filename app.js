// Retry configuration
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 1000; // 1 second

// Clear console at startup
console.clear();

// Set up console clear interceptor
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Throttled console clear to avoid clearing too frequently
let lastClear = Date.now();
const CLEAR_INTERVAL = 3000; // Clear every 3 seconds at most

// Override console methods
console.log = function() {
  if (Date.now() - lastClear > CLEAR_INTERVAL) {
    console.clear();
    lastClear = Date.now();
  }
  originalConsoleLog.apply(console, arguments);
};

console.error = function() {
  if (Date.now() - lastClear > CLEAR_INTERVAL) {
    console.clear();
    lastClear = Date.now();
  }
  originalConsoleError.apply(console, arguments);
};

console.warn = function() {
  if (Date.now() - lastClear > CLEAR_INTERVAL) {
    console.clear();
    lastClear = Date.now();
  }
  originalConsoleWarn.apply(console, arguments);
};

// AniList API endpoint
const ANILIST_API = 'https://graphql.anilist.co';

// Cache for storing fetched data
const cache = {
  trending: null, 
  popular: null,
  recent: null,
  seasonal: null,
  daily_updates: null,
  movies: null,     // Add movies cache
  tv_series: null,  // Add TV series cache
  detailedAnime: new Map(),
  sectionData: new Map(),
  lastFetch: {
    trending: 0,
    popular: 0,
    recent: 0,
    seasonal: 0,
    daily_updates: 0,
    movies: 0,      // Add movies timestamp
    tv_series: 0,   // Add TV series timestamp
    search: 0,      // Add search timestamp
    watchlist: 0    // Add watchlist timestamp
  }
};

const CACHE_DURATION = 20 * 60 * 1000; // Cache duration in milliseconds (20 minutes)

// Add cache handler for sections
const SectionCache = {
  set: function(section, data) {
    if (!section) return;
    cache.sectionData.set(section, {
      data: data,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    });
  },
  
  get: function(section) {
    if (!section) return null;
    const cached = cache.sectionData.get(section);
    if (!cached) return null;
    
    // Check if cache is still valid (20 minutes)
    if (Date.now() - cached.timestamp > CACHE_DURATION) {
      cache.sectionData.delete(section);
      return null;
    }
    
    return cached.data;
  },
  
  clear: function(section) {
    if (section) {
      cache.sectionData.delete(section);
    } else {
      cache.sectionData.clear();
    }
  }
};

// GraphQL query to fetch trending anime
const TRENDING_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media(sort: TRENDING_DESC, type: ANIME, isAdult: false, countryOfOrigin: "JP") {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

// Query for popular anime
const POPULAR_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: POPULARITY_DESC, type: ANIME, countryOfOrigin: "JP", isAdult: false) {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

// Query for recent anime
const RECENT_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: START_DATE_DESC, type: ANIME, status: RELEASING, isAdult: false, countryOfOrigin: "JP") {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

// Add more detailed AniList queries
const DETAILED_ANIME_QUERY = `
query ($id: Int) {
  Media (id: $id, type: ANIME, isAdult: false) {
    id
    title {
      romaji
      english
      native
    }
    description
    episodes
    duration
    status
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    season
    seasonYear
    format
    source
    genres
    tags {
      id
      name
      rank
    }
    averageScore
    popularity
    studios {
      nodes {
        id
        name
      }
    }
    relations {
      edges {
        relationType
        node {
          id
          title {
            romaji
            english
          }
          format
          type
          status
          coverImage {
            large
          }
          countryOfOrigin
        }
      }
    }
    characters(sort: ROLE) {
      edges {
        role
        node {
          id
          name {
            full
          }
          image {
            large
          }
        }
      }
    }
    recommendations {
      nodes {
        mediaRecommendation {
          id
          title {
            romaji
            english
          }
          coverImage {
            large
          }
          countryOfOrigin
        }
      }
    }
    coverImage {
      extraLarge
      large
      color
    }
    bannerImage
    trailer {
      id
      site
      thumbnail
    }
    isAdult
    countryOfOrigin
  }
}
`;

// Add seasonal anime query
const SEASONAL_QUERY = `
query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
  Page(page: $page, perPage: 20) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false, countryOfOrigin: "JP") {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

// New queries for movies and TV series
const MOVIES_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC, isAdult: false, countryOfOrigin: "JP") {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

const TV_SERIES_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, format: TV, sort: POPULARITY_DESC, isAdult: false, countryOfOrigin: "JP") {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

// Add search functionality
const SEARCH_QUERY = `
query ($page: Int, $perPage: Int, $search: String) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      isAdult
      countryOfOrigin
    }
  }
}
`;

// Add daily updates query
const DAILY_UPDATES_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: [UPDATED_AT_DESC, START_DATE_DESC], status: RELEASING, type: ANIME, isAdult: false, countryOfOrigin: "JP") {
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      nextAiringEpisode {
        episode
        airingAt
        timeUntilAiring
      }
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
      updatedAt
      isAdult
      countryOfOrigin
    }
  }
}
`;

// Enhanced fetchFromAniList with better retry logic and fallbacks
async function fetchFromAniList(query, variables = {}, cacheKey = null) {
  let attempts = 0;
  let lastError = null;
  const MAX_ATTEMPTS = 5;
  const BASE_DELAY = 1000;
  const MAX_DELAY = 10000;

  // Handle empty results with safer fallback queries
  function getQueryWithRelaxedFilters(originalQuery) {
    // Base query parts 
    const baseFields = `
      id
      title {
        romaji
        english
        native
      }
      description
      episodes
      status
      seasonYear
      season
      format
      averageScore
      popularity
      coverImage {
        large
      }
      genres
      studios {
        nodes {
          name
        }
      }
    `;

    // Adult content filter option as variable instead of hardcoded
    const adultFilter = variables.includeAdult ? '' : ', isAdult: false';
    const originFilter = variables.anyOrigin ? '' : ', countryOfOrigin: "JP"';
    
    // Construct dynamic query based on presence of filters
    return `
      query ($page: Int, $perPage: Int${variables.search ? ', $search: String' : ''}) {
        Page(page: $page, perPage: $perPage) {
          media(
            ${variables.search ? 'search: $search,' : ''}
            type: ANIME
            sort: [POPULARITY_DESC, SCORE_DESC]
            ${adultFilter}
            ${originFilter}
          ) {
            ${baseFields}
            ${variables.includeNextAiring ? `
              nextAiringEpisode {
                episode
                airingAt
                timeUntilAiring
              }
            ` : ''}
          }
        }
      }
    `;
  }

  // Initialize cache for this query if needed
  if (cacheKey && !cache[cacheKey]) {
    cache[cacheKey] = null;
    cache.lastFetch[cacheKey] = 0;
  }

  // For anime details queries, first try the cache
  if (variables.id && query.includes('Media (id: $id, type: ANIME')) {
    if (cache.detailedAnime.has(variables.id)) {
      return cache.detailedAnime.get(variables.id);
    }
  }

  // Helper function to calculate delay with exponential backoff
  const getDelay = (attempt) => {
    const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
    return delay + (Math.random() * 1000); // Add jitter
  };

  while (attempts < MAX_ATTEMPTS) {
    try {
      // Check cache first
      if (cacheKey) {
        const cachedData = SectionCache.get(cacheKey);
        if (cachedData) {
          return cachedData;
        }
      }

      // Add exponential backoff
      if (attempts > 0) {
        const delay = getDelay(attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Enhanced request with better timeout handling
      const controller = new AbortController();
      const timeoutDuration = query.includes('Media (id: $id, type: ANIME') ? 5000 : 15000;
      const timeout = setTimeout(() => controller.abort(), timeoutDuration);

      const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        body: JSON.stringify({
          query: query,
          variables: variables
        }),
        signal: controller.signal,
        priority: query.includes('Media (id: $id, type: ANIME') ? 'high' : 'auto'
      }).catch(err => {
        clearTimeout(timeout);
        throw err;
      });

      clearTimeout(timeout);

      if (!response.ok) {
        // Handle rate limits specially
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = (retryAfter ? parseInt(retryAfter) : 60) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          throw new Error('Rate limited');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Validate and sanitize response data
      if (!data || !data.data) {
        throw new Error('Invalid response format from AniList');
      }

      // Special handling for empty results
      if (data.data.Page && (!data.data.Page.media || data.data.Page.media.length === 0)) {
        // Try fallback query with relaxed filters
        if (!variables.includeAdult && !variables.anyOrigin) {
          // First try without origin filter
          variables.anyOrigin = true;
          const fallbackQuery = getQueryWithRelaxedFilters(query);
          return fetchFromAniList(fallbackQuery, variables, null);
        }
      }

      // Cache successful response
      if (cacheKey) {
        SectionCache.set(cacheKey, data.data);
      }
      
      // Cache anime details
      if (variables.id && query.includes('Media (id: $id, type: ANIME') && data.data?.Media) {
        cache.detailedAnime.set(variables.id, data.data);
      }

      return data.data;

    } catch (error) {
      lastError = error;
      attempts++;

      // Log the error for debugging
      console.warn(`AniList fetch attempt ${attempts} failed:`, error);

      // Special handling for network errors
      if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
        // Wait longer for network issues
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // On last attempt, try to return cached data even if expired
      if (attempts === MAX_ATTEMPTS) {
        if (cacheKey) {
          const expiredCache = SectionCache.get(cacheKey);
          if (expiredCache) {
            console.log('Using expired cache as fallback');
            return expiredCache;
          }
        }

        // Return valid empty data structure as last resort
        return {
          Page: {
            media: [],
            pageInfo: {
              total: 0,
              currentPage: 1,
              lastPage: 1,
              hasNextPage: false,
              perPage: 20
            }
          }
        };
      }
    }
  }

  // This should never be reached due to the fallback above
  console.error('AniList fetch failed completely:', lastError);
  return {
    Page: {
      media: [],
      pageInfo: {
        total: 0,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 20
      }
    }
  };
}

// Expose fetchFromAniList globally for modules that override it later
window.fetchFromAniList = window.fetchFromAniList || fetchFromAniList;

// Enhanced initializeAnimeData with parallel loading and fallbacks
async function initializeAnimeData() {
  // Prevent home refresh when watchlist is active
  if (window.currentView === 'watchlist') return;
  
  try {
    // Show loading state in UI
    const trendingGrid = document.getElementById('trending-grid');
    const recentGrid = document.getElementById('recent-grid');
    
    const loadingHtml = `
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading...</p>
      </div>
    `;
    
    trendingGrid.innerHTML = loadingHtml;
    recentGrid.innerHTML = loadingHtml;

    // Fetch different types of anime in parallel for variety
    const queries = [
      // Trending anime
      fetchFromAniList(TRENDING_QUERY, { page: 1, perPage: 10 }, 'trending'),
      // Popular anime
      fetchFromAniList(POPULAR_QUERY, { page: 1, perPage: 10 }, 'popular'),
      // Recent anime
      fetchFromAniList(RECENT_QUERY, { page: 1, perPage: 10 }, 'recent'),
      // Seasonal anime
      fetchFromAniList(SEASONAL_QUERY, { 
        season: getCurrentSeason(),
        seasonYear: new Date().getFullYear(),
        page: 1,
        perPage: 10
      }, 'seasonal'),
      // Popular movies
      fetchFromAniList(MOVIES_QUERY, { page: 1, perPage: 5 }, 'movies'),
      // Popular donghua
      fetchFromAniList(`
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(sort: POPULARITY_DESC, type: ANIME, countryOfOrigin: "CN", isAdult: false) {
              id
              title {
                romaji
                english
                native
              }
              description
              episodes
              status
              seasonYear
              season
              format
              averageScore
              popularity
              coverImage {
                large
              }
              genres
              studios {
                nodes {
                  name
                }
              }
              isAdult
              countryOfOrigin
            }
          }
        }
      `, { page: 1, perPage: 5 }, 'donghua')
    ];

    const results = await Promise.allSettled(queries);
    
    // Collect all valid anime entries
    let allAnime = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value?.Page?.media) {
        allAnime = [...allAnime, ...result.value.Page.media];
      }
    });

    // Remove duplicates by ID
    const uniqueAnime = Array.from(new Map(allAnime.map(item => [item.id, item])).values());

    // Shuffle the array
    const shuffledAnime = uniqueAnime.sort(() => Math.random() - 0.5);

    // Take first 5 for hero slider
    const heroAnimeList = shuffledAnime.slice(0, 5);

    // Use remaining anime for trending and recent sections
    const remainingAnime = shuffledAnime.slice(5);
    const trendingAnime = remainingAnime.slice(0, 24);
    const recentAnime = remainingAnime.slice(24, 48);

    // Process trending grid
    if (trendingGrid && trendingAnime.length > 0) {
      const trendingFragment = document.createDocumentFragment();
      trendingAnime.forEach(anime => {
        const animeData = convertAnimeData(anime);
        if (animeData) trendingFragment.appendChild(createAnimeCard(animeData));
      });
      trendingGrid.innerHTML = '';
      trendingGrid.appendChild(trendingFragment);
    }

    // Process recent grid
    if (recentGrid && recentAnime.length > 0) {
      const recentFragment = document.createDocumentFragment();
      recentAnime.forEach(anime => {
        const animeData = convertAnimeData(anime);
        if (animeData) recentFragment.appendChild(createAnimeCard(animeData));
      });
      recentGrid.innerHTML = '';
      recentGrid.appendChild(recentFragment);
    }

    // Update hero slider with mixed content
    updateHeroSlider(heroAnimeList.map(convertAnimeData).filter(item => item !== null));

  } catch (error) {
    console.error('Error initializing anime data:', error);
    handleLoadingError(trendingGrid, recentGrid);
  }
}

// Helper function to get current season
function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'SPRING';
  if (month >= 6 && month <= 8) return 'SUMMER';
  if (month >= 9 && month <= 11) return 'FALL';
  return 'WINTER';
}

// Enhanced daily update card creation
function createDailyUpdateCard(anime, nextEpisode) {
  const card = document.createElement('div');
  card.className = 'anime-card daily-update';
  
  // Calculate airing time information
  let nextEpisodeInfo = '';
  if (nextEpisode) {
    const timeUntil = getTimeUntilAiring(nextEpisode.timeUntilAiring);
    const airDate = new Date(Date.now() + (nextEpisode.timeUntilAiring * 1000));
    
    nextEpisodeInfo = `
      <div class="next-episode-info">
        <span class="next-ep">Episode ${nextEpisode.episode}</span>
        <span class="air-time">${timeUntil}</span>
        <div class="air-date">
          ${airDate.toLocaleDateString(undefined, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <img src="${anime.image}" alt="${anime.title}" loading="lazy">
    <div class="anime-card-content">
      <h3>${anime.title}</h3>
      <div class="meta">
        <span>${anime.episodes} Episodes</span>
        <span>⭐ ${anime.rating.toFixed(1)}</span>
      </div>
      ${nextEpisodeInfo}
      <div class="update-time">
        <i class="fas fa-clock"></i>
        <span>Last Updated: ${new Date(anime.lastUpdated).toLocaleString()}</span>
      </div>
    </div>
  `;
  
  // Add click handler
  card.addEventListener('click', () => showAnimeDetails(anime));
  
  return card;
}

// Enhanced error handling
function handleLoadingError(trendingGrid, recentGrid) {
  const errorHtml = `
    <div class="error-state">
      <i class="fas fa-exclamation-circle"></i>
      <p>Something went wrong. Please try again.</p>
      <button onclick="initializeAnimeData()" class="retry-btn">
        <i class="fas fa-redo"></i> Retry
      </button>
    </div>
  `;
  
  if (trendingGrid) trendingGrid.innerHTML = errorHtml;
  if (recentGrid) recentGrid.innerHTML = errorHtml;
}

// Updated getTimeUntilAiring with more detailed time info
function getTimeUntilAiring(seconds) {
  if (!seconds) return 'TBA';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `In ${days}d ${hours}h`;
  } else if (hours > 0) {
    return `In ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `In ${minutes}m`;
  } else {
    return 'Airing now!';
  }
}

// Function to convert AniList data to our format
function convertAnimeData(anilistData) {
  try {
    // Filter out adult content but keep donghua (CN) and other non-JP anime
    if (anilistData.isAdult) {
      return null;
    }
    
    // Use nullish coalescing for more efficient property access
    const title = anilistData.title?.english ?? anilistData.title?.romaji ?? 'Unknown Anime';
    const image = anilistData.coverImage?.large ?? '';
    
    // Create a nextEpisode property if available (using optional chaining for safety)
    const nextEpisode = anilistData.nextAiringEpisode ? {
      episode: anilistData.nextAiringEpisode.episode,
      airingAt: anilistData.nextAiringEpisode.airingAt,
      timeUntilAiring: anilistData.nextAiringEpisode.timeUntilAiring
    } : null;
    
    // Return optimized data structure with faster property access
    return {
      title,
      originalTitle: anilistData.title?.native ?? '',
      episodes: anilistData.episodes ?? '?',
      rating: (anilistData.averageScore ? anilistData.averageScore / 10 : 0) || 0,
      image,
      type: anilistData.format ?? 'Unknown',
      popularity: anilistData.popularity ?? 0,
      lastUpdated: anilistData.updatedAt ? (anilistData.updatedAt * 1000) : Date.now(),
      synopsis: anilistData.description?.replace(/<[^>]*>/g, '') ?? 'No description available.',
      genres: anilistData.genres?.filter(g => g !== 'Hentai') ?? [],
      studio: anilistData.studios?.nodes?.[0]?.name ?? 'Unknown Studio',
      season: anilistData.season ?? null,
      seasonYear: anilistData.seasonYear ?? null,
      status: anilistData.status ?? 'UNKNOWN',
      id: anilistData.id,
      nextEpisode,
      countryOfOrigin: anilistData.countryOfOrigin ?? "JP"
    };
  } catch (error) {
    console.error('Error converting anime data:', error);
    return null;
  }
}

// Function to create anime card
function createAnimeCard(anime) {
  if (!anime) return document.createDocumentFragment(); // Return empty fragment for filtered content
  
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.dataset.animeId = anime.id; // Add anime ID as data attribute for cache retrieval
  
  // Add next episode info if available
  let nextEpisodeInfo = '';
  if (anime.nextEpisode) {
    const timeUntil = getTimeUntilAiring(anime.nextEpisode.timeUntilAiring);
    nextEpisodeInfo = `
      <div class="next-episode-info">
        <span class="next-ep">Episode ${anime.nextEpisode.episode}</span>
        <span class="air-time">${timeUntil}</span>
      </div>
    `;
  }
  
  card.innerHTML = `
    <img src="${anime.image}" alt="${anime.title}" loading="lazy">
    <div class="anime-card-content">
      <h3>${anime.title}</h3>
      <div class="meta">
        <span>${anime.episodes} Episodes</span>
        <span>⭐ ${anime.rating}</span>
      </div>
      ${nextEpisodeInfo}
    </div>
  `;
  
  // Add click handler
  card.addEventListener('click', () => showAnimeDetails(anime));
  
  return card;
}

window.showAnimeDetails = async function(anime) {
  if (!anime || !anime.id) {
    console.error('Invalid anime data provided to showAnimeDetails');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'anime-details-modal';
  document.body.appendChild(modal);
  
  try {
    // Show loading state immediately (non-blocking)
    modal.innerHTML = `
      <div class="anime-details-content">
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading anime details...</p>
        </div>
      </div>
    `;
    
    modal.classList.add('show');

    // Start cache checks and API requests in parallel for faster loading
    // Create a promise that resolves in 4 seconds as a fallback
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 4000));
    
    // Try with cache first (immediate check)
    let detailedData = null;
    let media = null;
    
    if (cache.detailedAnime.has(anime.id)) {
      detailedData = cache.detailedAnime.get(anime.id);
      if (detailedData?.Media) {
        media = detailedData.Media;
        detailedData.lastAccessed = Date.now();
        cache.detailedAnime.set(anime.id, detailedData);
      }
    }
    
    // If not in cache, initiate API fetch and fallback in parallel
    if (!media) {
      // Create new requests in parallel with timeout protection
      const fetchPromise = fetchFromAniList(DETAILED_ANIME_QUERY, { id: anime.id })
        .catch(error => {
          console.error(`Fetch error for anime ${anime.id}:`, error);
          return null;
        });
      
      // Race between API call and timeout
      media = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (media?.Media) {
        cache.detailedAnime.set(anime.id, { Media: media });
      }
    }

    // If we still don't have media data, use the basic anime data as fallback for faster rendering
    if (!media && anime) {
      // Create a compatible structure from basic anime data
      media = {
        id: anime.id,
        title: {
          english: anime.title,
          romaji: anime.title,
          native: anime.originalTitle || anime.title,
        },
        description: anime.synopsis || 'No description available.',
        episodes: anime.episodes || '?',
        duration: null,
        status: anime.status || 'UNKNOWN',
        startDate: { year: anime.seasonYear, month: null, day: null },
        season: anime.season,
        seasonYear: anime.seasonYear,
        format: anime.type,
        genres: anime.genres || [],
        averageScore: (anime.rating * 10) || 0,
        popularity: anime.popularity || 0,
        studios: { nodes: [{ name: anime.studio || 'Unknown Studio' }] },
        coverImage: {
          extraLarge: anime.image,
          large: anime.image,
        },
        bannerImage: anime.image,
        relations: { edges: [] },
        characters: { edges: [] },
        recommendations: { nodes: [] },
        trailer: null
      };

      // Start a non-blocking background fetch for full details to update later
      fetchFromAniList(DETAILED_ANIME_QUERY, { id: anime.id })
        .then(fullData => {
          if (fullData?.Media) {
            cache.detailedAnime.set(anime.id, fullData);
          }
        })
        .catch(error => console.error('Background fetch error:', error));
    }

    // Immediately render with whatever data we have (basic or complete)
    if (media) {
      const cleanDescription = media.description?.replace(/<[^>]*>/g, '') || 'No description available.';
      
      // Format start date
      const startDate = media.startDate?.year ? 
        `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, '0')}-${String(media.startDate.day || 1).padStart(2, '0')}` : 
        'TBA';

      // Format status
      const statusMap = {
        'FINISHED': 'Completed',
        'RELEASING': 'Currently Airing',
        'NOT_YET_RELEASED': 'Coming Soon',
        'CANCELLED': 'Cancelled',
        'HIATUS': 'On Hiatus'
      };

      modal.innerHTML = `
        <div class="anime-details-content">
          <span class="close-anime-details">&times;</span>
          <div class="anime-details-header">
            <img src="${media.coverImage.extraLarge || media.coverImage.large}" 
                 alt="${media.title.english || media.title.romaji}" 
                 class="anime-cover"
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=No+Image';">
            <div class="anime-info">
              <h2>${media.title.english || media.title.romaji}</h2>
              <div class="anime-titles">
                ${media.title.native ? `<span class="native-title">${media.title.native}</span>` : ''}
                ${media.title.romaji && media.title.romaji !== media.title.english ? `<span class="romaji-title">${media.title.romaji}</span>` : ''}
              </div>

              <div class="anime-meta">
                <div class="info-item">
                  <i class="fas fa-film"></i>
                  <span>Type: ${media.format || 'Unknown'}</span>
                </div>
                <div class="info-item">
                  <i class="fas fa-star"></i>
                  <span>Score: ${(media.averageScore / 10).toFixed(1)}/10</span>
                </div>
                ${media.countryOfOrigin && media.countryOfOrigin !== "JP" ? 
                  `<div class="info-item">
                    <i class="fas fa-globe"></i>
                    <span>Origin: ${media.countryOfOrigin === "CN" ? "Chinese Donghua" : 
                                      media.countryOfOrigin === "KR" ? "Korean Animation" : 
                                      media.countryOfOrigin}</span>
                  </div>` : ''}
                <div class="info-item">
                  <i class="fas fa-tv"></i>
                  <span>Episodes: ${media.episodes || '?'}</span>
                </div>
                <div class="info-item">
                  <i class="fas fa-clock"></i>
                  <span>Duration: ${media.duration || '?'} mins</span>
                </div>
                <div class="info-item">
                  <i class="fas fa-calendar-alt"></i>
                  <span>Aired: ${startDate}</span>
                </div>
                <div class="info-item">
                  <i class="fas fa-signal"></i>
                  <span>Status: ${statusMap[media.status] || media.status || 'Unknown'}</span>
                </div>
              </div>

              <div class="genres">
                ${(media.genres || []).map(genre => `<span class="genre-tag">${genre}</span>`).join('')}
              </div>

              <div class="anime-description">
                <h3>Synopsis</h3>
                <p>${cleanDescription}</p>
              </div>

              <div class="studios">
                <h3>Studios</h3>
                <div class="studio-list">
                  ${(media.studios?.nodes || []).map(studio => `<span class="studio-tag">${studio.name}</span>`).join('')}
                </div>
              </div>

              ${media.trailer ? `
                <div class="trailer-section">
                  <h3>Trailer</h3>
                  <div class="trailer-container">
                    <iframe 
                      width="100%" 
                      height="315" 
                      src="https://www.youtube.com/embed/${media.trailer.id}" 
                      frameborder="0" 
                      allowfullscreen>
                    </iframe>
                  </div>
                </div>
              ` : ''}

              <div class="anime-actions">
                <button class="watch-btn" onclick="
                  document.querySelectorAll('.anime-details-modal').forEach(modal => {
                    modal.classList.remove('show');
                    setTimeout(() => modal.remove(), 100);
                  });
                  initializeVideoPlayer({
                    id: '${media.id}',
                    title: '${(media.title.english || media.title.romaji).replace(/'/g, "\\'")}',
                    episodes: ${media.episodes || 1},
                    image: '${media.coverImage.large || ''}'
                  });
                ">
                  <i class="fas fa-play"></i> Watch Now
                </button>
                <button class="add-list-btn" data-anime-id="${media.id}" onclick="addToWatchlist('${media.id}')" 
                        style="width: 100%; margin-top: 10px; padding: 8px; border-radius: 4px;">
                  <i class="fas fa-plus"></i> Add to List
                </button>
                <button class="share-btn" onclick="shareAnime('${media.id}')">
                  <i class="fas fa-share"></i> Share
                </button>
              </div>
            </div>
          </div>

          <div class="additional-info">
            <div class="info-tabs">
              <button class="tab-btn active" data-tab="characters">Characters</button>
              <button class="tab-btn" data-tab="related">Related</button>
              <button class="tab-btn" data-tab="recommendations">Recommendations</button>
            </div>

            <div class="tab-content characters active">
              <div class="characters-grid">
                ${media.characters && media.characters.edges && media.characters.edges.length > 0 ?
                  media.characters.edges.slice(0, 8).map(char => `
                    <div class="character-card">
                      <img src="${char.node.image?.large || 'https://via.placeholder.com/150x200?text=No+Image'}" 
                           alt="${char.node.name?.full || 'Character'}"
                           onerror="this.onerror=null; this.src='https://via.placeholder.com/150x200?text=No+Image';">
                      <h4>${char.node.name?.full || 'Unknown'}</h4>
                      <span class="character-role">${char.role || 'Unknown'}</span>
                    </div>
                  `).join('') :
                  '<div class="no-data-message">No character information available</div>'
                }
              </div>
            </div>

            <div class="tab-content related">
              <div class="related-anime">
                ${media.relations && media.relations.edges && media.relations.edges.length > 0 ?
                  media.relations.edges.map(relation => `
                    <div class="related-card" onclick="showAnimeDetails({
                      id: ${relation.node.id},
                      title: '${(relation.node.title?.english || relation.node.title?.romaji || 'Unknown Title').replace(/'/g, "\\'")}',
                      image: '${relation.node.coverImage?.large || ''}',
                      episodes: ${relation.node.episodes || '0'},
                      rating: ${relation.node.averageScore ? relation.node.averageScore / 10 : 0},
                      status: '${relation.node.status || ''}',
                      type: '${relation.node.format || ''}',
                      synopsis: '${(relation.node.description || 'No description available.').replace(/'/g, "\\'")}',
                      genres: ${JSON.stringify(relation.node.genres || [])},
                      studio: '${(relation.node.studios?.nodes?.[0]?.name || 'Unknown Studio').replace(/'/g, "\\'")}'
                    })">
                      <img src="${relation.node.coverImage?.large || 'https://via.placeholder.com/150x200?text=No+Image'}" 
                           alt="${relation.node.title?.english || relation.node.title?.romaji || 'Related Anime'}"
                           onerror="this.onerror=null; this.src='https://via.placeholder.com/150x200?text=No+Image';">
                      <h4>${relation.node.title?.english || relation.node.title?.romaji || 'Unknown Title'}</h4>
                      <span class="relation-type">${relation.relationType || 'Related'}</span>
                    </div>
                  `).join('') :
                  '<div class="no-data-message">No related anime available</div>'
                }
              </div>
            </div>

            <div class="tab-content recommendations">
              <div class="recommendations-grid">
                ${media.recommendations && media.recommendations.nodes && media.recommendations.nodes.length > 0 ?
                  media.recommendations.nodes.slice(0, 6).map(rec => {
                    if (!rec.mediaRecommendation) return '';
                    return `
                      <div class="recommendation-card" onclick="showAnimeDetails({
                        id: '${rec.mediaRecommendation.id}',
                        title: '${(rec.mediaRecommendation.title?.english || rec.mediaRecommendation.title?.romaji || 'Unknown Title').replace(/'/g, "\\'")}',
                        image: '${rec.mediaRecommendation.coverImage?.large || ''}',
                        episodes: ${rec.mediaRecommendation.episodes || '0'},
                        rating: ${rec.mediaRecommendation.averageScore ? rec.mediaRecommendation.averageScore / 10 : 0},
                        status: '${rec.mediaRecommendation.status || ''}',
                        type: '${rec.mediaRecommendation.format || ''}',
                        synopsis: '${(rec.mediaRecommendation.description || 'No description available.').replace(/'/g, "\\'")}',
                        genres: ${JSON.stringify(rec.mediaRecommendation.genres || [])},
                        studio: '${(rec.mediaRecommendation.studios?.nodes?.[0]?.name || 'Unknown Studio').replace(/'/g, "\\'")}',
                        id: ${rec.mediaRecommendation.id}
                      })">
                        <img src="${rec.mediaRecommendation.coverImage?.large || 'https://via.placeholder.com/150x200?text=No+Image'}" 
                             alt="${rec.mediaRecommendation.title?.english || rec.mediaRecommendation.title?.romaji || 'Recommended Anime'}"
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/150x200?text=No+Image';">
                        <h4>${rec.mediaRecommendation.title?.english || rec.mediaRecommendation.title?.romaji || 'Unknown Title'}</h4>
                      </div>
                    `;
                  }).join('') :
                  '<div class="no-data-message">No recommendations available</div>'
                }
              </div>
            </div>
          </div>
        </div>
      `;

      // Add tab switching functionality
      const tabBtns = modal.querySelectorAll('.info-tabs .tab-btn');
      const tabContents = modal.querySelectorAll('.tab-content');

      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            modal.querySelector(`.tab-content.${btn.dataset.tab}`).classList.add('active');
          } catch(err) {
            console.error('Tab switch error:', err);
          }
        });
      });

      // Add click handlers for close button
      const closeBtn = modal.querySelector('.close-anime-details');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.classList.remove('show');
          setTimeout(() => modal.remove(), 300);
        });
      }

      // Check watchlist status after modal is created
      try {
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session?.user) {
          const { data: snapshot, error } = await window.supabase
            .from('watchlist')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('anime_id', media.id)
            .single();
          
          if (!error && snapshot) {
            const watchlistBtn = modal.querySelector(`.add-list-btn[data-anime-id="${media.id}"]`);
            if (watchlistBtn) {
              watchlistBtn.innerHTML = '<i class="fas fa-check"></i> In List';
            }
          }
        }
      } catch (firebaseError) {
        console.error('Firebase error in anime details:', firebaseError);
      }
    } else {
      throw new Error('Failed to load anime details after multiple attempts');
    }
  } catch (error) {
    console.error('Error showing anime details:', error);
    modal.innerHTML = `
      <div class="anime-details-content">
        <span class="close-anime-details">&times;</span>
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <h3>Failed to load complete anime details</h3>
          <p>We're showing limited information due to a temporary issue.</p>
          <div class="anime-details-header" style="margin-top:20px;">
            <img src="${anime.image || 'https://via.placeholder.com/300x450?text=No+Image'}" 
                alt="${anime.title || 'Anime'}" 
                class="anime-cover"
                onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=No+Image';">
            <div class="anime-info">
              <h2>${anime.title || 'Unknown Anime'}</h2>
              <div class="anime-meta">
                <div class="info-item">
                  <i class="fas fa-film"></i>
                  <span>Type: ${anime.type || 'Unknown'}</span>
                </div>
                <div class="info-item">
                  <i class="fas fa-star"></i>
                  <span>Score: ${anime.rating || 'N/A'}</span>
                </div>
                <div class="info-item">
                  <i class="fas fa-tv"></i>
                  <span>Episodes: ${anime.episodes || '?'}</span>
                </div>
              </div>
              <div class="anime-description">
                <h3>Synopsis</h3>
                <p>${anime.synopsis || 'No description available.'}</p>
              </div>
              <div class="studios">
                <h3>Studios</h3>
                <div class="studio-list">
                  ${(anime.studios?.nodes || []).map(studio => `<span class="studio-tag">${studio.name}</span>`).join('')}
                </div>
              </div>

              <div class="anime-actions">
                <button class="watch-btn" onclick="
                  document.querySelectorAll('.anime-details-modal').forEach(modal => {
                    modal.classList.remove('show');
                    setTimeout(() => modal.remove(), 100);
                  });
                  initializeVideoPlayer({
                    id: '${media.id}',
                    title: '${anime.title ? anime.title.replace(/'/g, "\\'") : 'Unknown Anime'}',
                    episodes: ${anime.episodes || 1},
                    image: '${anime.image || ''}'
                  });
                ">
                  <i class="fas fa-play"></i> Watch Now
                </button>
                <button class="retry-btn" onclick="showAnimeDetails(${JSON.stringify(anime).replace(/"/g, '\'')})">
                  <i class="fas fa-redo"></i> Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
  }

  // Outside click handler
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    }
  });
};

// Enhanced video player initialization 
async function initializeVideoPlayer(anime, episodeNumber = 1) {
  if (!anime || !anime.id) {
    console.error('Invalid anime data provided to video player');
    return;
  }

  console.log('Initializing player for:', anime.title, 'Episode:', episodeNumber);
  
  try {
    const videoPlayerModal = document.getElementById('videoPlayerModal');
    const videoTitle = document.querySelector('.video-title');
    const episodeList = document.getElementById('episodeList');
    const animeInfoCard = document.querySelector('.anime-info-card');

    // Close any open anime details modal first
    document.querySelectorAll('.anime-details-modal').forEach(modal => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 100);
    });

    // Show video player modal
    if (videoPlayerModal) videoPlayerModal.classList.add('show');
    if (videoTitle) videoTitle.textContent = `${anime.title} - Episode ${episodeNumber}`;

    // Initialize video container with message
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
      videoContainer.innerHTML = `
        <div class="error-state">
          <i class="fas fa-film"></i>
          <h3>Coming Soon</h3>
          <p>Video playback functionality will be available soon!</p>
        </div>
      `;
    }

    // Get detailed anime info if not already available
    let animeDetails = null;
    if (cache.detailedAnime && cache.detailedAnime.has(anime.id)) {
      animeDetails = cache.detailedAnime.get(anime.id).Media;
    } else {
      try {
        const detailedData = await fetchFromAniList(DETAILED_ANIME_QUERY, { id: anime.id });
        if (detailedData?.Media) {
          animeDetails = detailedData.Media;
          cache.detailedAnime.set(anime.id, { Media: animeDetails });
        }
      } catch (error) {
        console.error('Error fetching anime details:', error);
      }
    }

    // Populate anime info card
    if (animeInfoCard) {
      if (animeDetails) {
        animeInfoCard.innerHTML = `
          <img src="${animeDetails.coverImage.large}" alt="${anime.title}">
          <h3>${anime.title}</h3>
          <div class="meta">
            <span>${animeDetails.episodes || '?'} Episodes</span>
            <span>⭐ ${animeDetails.averageScore / 10}</span>
          </div>
          <button class="add-list-btn" data-anime-id="${anime.id}" onclick="addToWatchlist('${anime.id}')" 
                  style="width: 100%; margin-top: 10px; padding: 8px; border-radius: 4px;">
            <i class="fas fa-plus"></i> Add to List
          </button>
        `;
        animeInfoCard.dataset.animeId = anime.id;
        
        // Check watchlist status
        checkWatchlistStatus(anime.id);
      } else {
        animeInfoCard.innerHTML = `
          <img src="${anime.image}" alt="${anime.title}">
          <h3>${anime.title}</h3>
          <div class="meta">
            <span>${anime.episodes || '?'} Episodes</span>
            <span>⭐ ${anime.rating}</span>
          </div>
          <button class="add-list-btn" data-anime-id="${anime.id}" onclick="addToWatchlist('${anime.id}')"
                  style="width: 100%; margin-top: 10px; padding: 8px; border-radius: 4px;">
            <i class="fas fa-plus"></i> Add to List
          </button>
        `;
        animeInfoCard.dataset.animeId = anime.id;
        
        // Check watchlist status
        checkWatchlistStatus(anime.id);
      }
    }

    // Create episode list with thumbnails and descriptions
    if (episodeList) {
      episodeList.innerHTML = `
        <div class="loading-message" style="position:static;color:var(--text-secondary);padding:0.75rem;">
          <i class="fas fa-list" style="margin-right:8px;"></i> Episodes list coming soon
        </div>
      `;
    }

  } catch (error) {
    console.error('Player initialization error:', error);
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
      videoContainer.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error initializing video player</p>
          <button onclick="initializeVideoPlayer(${JSON.stringify(anime)}, ${episodeNumber})" class="retry-btn">
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>
      `;
    }
  }
}

// Helper functions for episode descriptions
function generateEpisodeDescription(animeTitle, episodeNumber) {
  const descriptions = [
    `Join our heroes as they face new challenges in their journey.`,
    `A powerful enemy emerges, testing the limits of our characters.`,
    `Secrets from the past are revealed, changing everything.`,
    `An unexpected ally appears just when all hope seems lost.`,
    `The team must work together to overcome their greatest obstacle yet.`,
    `A heartfelt moment brings our characters closer together.`,
    `The stakes are raised as the story reaches a turning point.`,
    `The truth behind the mystery is finally uncovered.`,
    `A shocking betrayal leaves everyone stunned.`,
    `A fierce battle ensues with everything on the line.`
  ];
  
  // Use deterministic selection based on anime title and episode number
  const seed = animeTitle.length + episodeNumber;
  const index = seed % descriptions.length;
  
  return descriptions[index];
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// New functions to load movies and TV series
async function loadMovies() {
  try {
    const moviesData = await fetchFromAniList(MOVIES_QUERY, {
      page: 1,
      perPage: 24
    });
    
    if (moviesData?.Page?.media) {
      const trendingGrid = document.getElementById('trending-grid');
      trendingGrid.innerHTML = '';
      moviesData.Page.media.forEach(anime => {
        const animeData = convertAnimeData(anime);
        trendingGrid.appendChild(createAnimeCard(animeData));
      });
    }
  } catch (error) {
    console.error('Error loading movies:', error);
  }
}

async function loadTVSeries() {
  try {
    const tvData = await fetchFromAniList(TV_SERIES_QUERY, {
      page: 1,
      perPage: 24
    });
    
    if (tvData?.Page?.media) {
      const trendingGrid = document.getElementById('trending-grid');
      trendingGrid.innerHTML = '';
      tvData.Page.media.forEach(anime => {
        const animeData = convertAnimeData(anime);
        trendingGrid.appendChild(createAnimeCard(animeData));
      });
    }
  } catch (error) {
    console.error('Error loading TV series:', error);
  }
}

// Update the category filter function to fetch more items
async function filterAnimeByCategory(category) {
  // Normalize input (small fix)
  const normalizedCategory = category.toLowerCase().replace(/\s+/g, '');
  // Update current view (avoid 'watchlist' since this is category-based)
  window.currentView = normalizedCategory === 'home' ? 'home' : normalizedCategory;

  // Update nav links active state
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.textContent.trim().toLowerCase().replace(/\s+/g, '') === normalizedCategory) {
      link.classList.add('active');
    }
  });

  const trendingHeading = document.querySelector('.trending h2');
  const recentHeading = document.querySelector('.recently-updated h2');
  const trendingGrid = document.getElementById('trending-grid');
  const recentGrid = document.getElementById('recent-grid');

  // Loading state
  if (trendingGrid) trendingGrid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';
  if (recentGrid) recentGrid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';

  // Use SectionCache first
  const cacheKey = `section_${normalizedCategory}`;
  const cachedData = SectionCache.get(cacheKey);
  if (cachedData) {
    console.log(`Using cached data for ${category}`);
    if (trendingHeading) trendingHeading.textContent = cachedData.trendingTitle;
    if (recentHeading) recentHeading.textContent = cachedData.recentTitle;
    if (trendingGrid) trendingGrid.innerHTML = cachedData.trendingContent;
    if (recentGrid) recentGrid.innerHTML = cachedData.recentContent;

    // Reattach click listeners to cards
    document.querySelectorAll('.anime-card').forEach(card => {
      card.addEventListener('click', () => {
        const animeId = card.dataset.animeId;
        if (animeId && cache.detailedAnime.has(parseInt(animeId))) {
          const animeData = convertAnimeData(cache.detailedAnime.get(parseInt(animeId)).Media);
          showAnimeDetails(animeData);
        }
      });
    });
    return;
  }

  try {
    let trendingTitle = '';
    let recentTitle = '';
    let trendingQuery = '';
    let recentQuery = '';

    // Correct category matching
    switch (normalizedCategory) {
      case 'movies':
        trendingTitle = '🎬 Popular Movies';
        recentTitle = '🆕 Recent Movies';
        trendingQuery = MOVIES_QUERY;
        recentQuery = MOVIES_QUERY;
        break;

      case 'tv':
      case 'tvseries':
        trendingTitle = '📺 Popular TV Series';
        recentTitle = '🆕 Airing TV Series';
        trendingQuery = TV_SERIES_QUERY;
        recentQuery = `
          query ($page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              media(type: ANIME, format: TV, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
                id title { romaji english native } coverImage { large }
              }
            }
          }
        `;
        break;

      case 'popular':
        trendingTitle = '🔥 Most Popular';
        recentTitle = '📈 Rising Stars';
        trendingQuery = POPULAR_QUERY;
        recentQuery = TRENDING_QUERY;
        break;

      case 'new':
      case 'recentlyadded':
        trendingTitle = '🆕 Recently Added';
        recentTitle = '📅 Newest Releases';
        trendingQuery = RECENT_QUERY;
        recentQuery = `
          query ($page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              media(type: ANIME, status: NOT_YET_RELEASED, sort: START_DATE_DESC, isAdult: false) {
                id title { romaji english native } coverImage { large }
              }
            }
          }
        `;
        break;

      default:
        trendingTitle = '🔥 Trending Now';
        recentTitle = '📺 Daily Updates';
        trendingQuery = TRENDING_QUERY;
        recentQuery = DAILY_UPDATES_QUERY;
    }

    if (trendingHeading) trendingHeading.textContent = trendingTitle;
    if (recentHeading) recentHeading.textContent = recentTitle;

    // Fetch data
    const [trendingData, recentData] = await Promise.all([
      fetchFromAniList(trendingQuery, { page: 1, perPage: 24 }),
      fetchFromAniList(recentQuery, { page: 1, perPage: 24 })
    ]);

    // Render trending
    const trendingFragment = document.createDocumentFragment();
    trendingData?.Page?.media?.forEach(anime => {
      const animeData = convertAnimeData(anime);
      if (animeData) trendingFragment.appendChild(createAnimeCard(animeData));
    });
    trendingGrid.innerHTML = '';
    trendingGrid.appendChild(trendingFragment);

    // Render recent
    const recentFragment = document.createDocumentFragment();
    recentData?.Page?.media?.forEach(anime => {
      const animeData = convertAnimeData(anime);
      if (animeData) recentFragment.appendChild(createAnimeCard(animeData));
    });
    recentGrid.innerHTML = '';
    recentGrid.appendChild(recentFragment);

    // Save to cache
    SectionCache.set(cacheKey, {
      trendingTitle,
      recentTitle,
      trendingContent: trendingGrid.innerHTML,
      recentContent: recentGrid.innerHTML
    });

    // Attach event listeners
    document.querySelectorAll('.anime-card').forEach(card => {
      card.addEventListener('click', () => {
        const animeId = card.dataset.animeId;
        if (animeId) {
          const animeData = {
            id: animeId,
            title: card.querySelector('h3').textContent,
            image: card.querySelector('img').src,
            episodes: card.querySelector('.meta span:first-child')?.textContent.split(' ')[0] || '12',
            rating: parseFloat(card.querySelector('.meta span:last-child')?.textContent.replace('⭐ ', '') || '0')
          };
          showAnimeDetails(animeData);
        }
      });
    });

  } catch (error) {
    console.error('Error filtering anime:', error);
    handleLoadingError(trendingGrid, recentGrid);
  }
}

// Expose filterAnimeByCategory globally before any overrides wrap it
window.filterAnimeByCategory = window.filterAnimeByCategory || filterAnimeByCategory;

// Helper function to render anime grid from cached HTML
function renderAnimeGrid(headingElement, gridElement, cachedHtml, headingText) {
  if (headingElement && headingText) {
    headingElement.textContent = headingText;
  }
  if (gridElement && cachedHtml) {
    gridElement.innerHTML = cachedHtml;
    // Reattach event listeners to anime cards
    gridElement.querySelectorAll('.anime-card').forEach(card => {
      card.addEventListener('click', () => {
        const animeId = card.dataset.animeId;
        if (animeId) {
          const animeData = {
            id: animeId,
            title: card.querySelector('h3').textContent,
            image: card.querySelector('img').src,
            episodes: card.querySelector('.meta span:first-child')?.textContent.split(' ')[0] || '12',
            rating: parseFloat(card.querySelector('.meta span:last-child')?.textContent.replace('⭐ ', '') || '0')
          };
          showAnimeDetails(animeData);
        }
      });
    });
  }
}

// Add search button click handler
document.querySelector('.search-bar button').addEventListener('click', () => {
  // Trigger search if there's text in the input
  if (document.getElementById('search').value.trim().length > 0) {
    const event = new Event('input');
    document.getElementById('search').dispatchEvent(event);
    document.getElementById('search').blur(); // Remove focus from search input
  }
});

// Also trigger search on enter key
document.getElementById('search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && document.getElementById('search').value.trim().length > 0) {
    const event = new Event('input');
    document.getElementById('search').dispatchEvent(event);
    document.getElementById('search').blur(); // Remove focus from search input
  }
});

// Update the nav links click handlers in the DOMContentLoaded event
document.addEventListener('DOMContentLoaded', () => {
  initializeAnimeData();
  loadSeasonalAnime();
  
  // Refresh data periodically
  setInterval(() => {
    initializeAnimeData();
    loadSeasonalAnime();
  }, 300000); // Refresh every 5 minutes

  // Update nav links to properly set active state and update headings
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Remove active class from all links
      navLinks.forEach(l => l.classList.remove('active'));
      // Add active class to clicked link
      link.classList.add('active');
      
      navigateSection(link.textContent);
    });
  });

  // Handle profile dropdown toggle
  const userAvatar = document.getElementById('userAvatar');
  const dropdownContent = document.querySelector('.dropdown-content');

  if (userAvatar) {
    userAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownContent.classList.toggle('show');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.matches('.profile-icon') && dropdownContent) {
      dropdownContent.classList.remove('show');
    }
  });

  // Listen for profile loaded events to refresh UI
  window.addEventListener('profileLoaded', (event) => {
    if (event.detail?.user) {
      // Refresh any profile-dependent UI elements
      setTimeout(() => {
        if (typeof window.refreshUserProfile === 'function') {
          window.refreshUserProfile();
        }
      }, 100);
    }
  });

  // Update auth state UI with Supabase
  window.supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user || null;
    const authButton = document.getElementById('authButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const chatInput = document.getElementById('chatInput');
    const sendMessage = document.getElementById('sendMessage');
    const chatLoginPrompt = document.getElementById('chatLoginPrompt');

    console.log('App auth state changed:', event, user?.id);

    if (user) {
      // User is signed in
      if (authButton) authButton.style.display = 'none';
      if (profileDropdown) profileDropdown.style.display = 'inline-block';
      
      // Get profile data from Supabase with retry mechanism
      let profileData = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && !profileData) {
        try {
          profileData = await window.loadUserProfile(user.id);
          if (profileData) break;
        } catch (error) {
          console.warn(`Profile load attempt ${retryCount + 1} failed:`, error);
        }
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      // Update username display
      const displayName = profileData?.username || user.user_metadata?.username || user.email.split('@')[0];
      document.querySelectorAll('.user-display-name').forEach(el => {
        if (el) el.textContent = displayName;
      });

      // Update user email
      const userEmailEl = document.getElementById('userEmail');
      if (userEmailEl) userEmailEl.textContent = user.email;

      // Update avatar everywhere
      const providerAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || (user?.identities || []).find(i => i.provider === 'google')?.identity_data?.picture || null;
      const avatarUrl = profileData?.avatar_url || providerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
      document.querySelectorAll('.profile-icon, .user-avatar, #avatarPreview').forEach(el => {
        if (el) {
          el.src = avatarUrl;
          el.onerror = function() {
            this.onerror = null;
            this.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
          };
        }
      });

      // Enable chat
      if (chatInput) chatInput.disabled = false;
      if (sendMessage) sendMessage.disabled = false;
      if (chatLoginPrompt) chatLoginPrompt.classList.remove('visible');

      // Hide auth modal if open
      const authModal = document.getElementById('authModal');
      if (authModal) {
        authModal.classList.remove('show');
        setTimeout(() => { authModal.style.display = 'none'; }, 300);
      }
    } else {
      // User is signed out
      if (authButton) authButton.style.display = 'inline-block';
      if (profileDropdown) profileDropdown.style.display = 'none';
      
      // Disable chat
      if (chatInput) chatInput.disabled = true;
      if (sendMessage) sendMessage.disabled = true;
      if (chatLoginPrompt) chatLoginPrompt.classList.add('visible');
    }
  });

  // Sign out handler
  if (typeof window.signOut !== 'function') {
    window.signOut = async function(event) {
      if (event?.preventDefault) event.preventDefault();
      return (await (window.signOut?.(event)));
    };
  }

  // Settings modal handler
  const settingsBtn = document.getElementById('openSettings');
  const settingsModal = document.getElementById('settingsModal');
  
  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      settingsModal.classList.add('show');
    });

    // Close settings modal
    const closeSettings = settingsModal.querySelector('.close');
    if (closeSettings) {
      closeSettings.addEventListener('click', () => {
        settingsModal.classList.remove('show');
      });
    }
  }

  // Add settings functionality
  // Theme settings
  const themeOptions = document.querySelectorAll('.theme-option');
  themeOptions.forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.dataset.theme;
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      
      themeOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
    });
  });

  // Language settings
  const languageOptions = document.querySelectorAll('.language-option');
  languageOptions.forEach(option => {
    option.addEventListener('click', () => {
      const lang = option.dataset.lang;
      localStorage.setItem('language', lang);
      
      languageOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');

      // Update the page text
      updateLanguage(lang);
    });
  });

  // Load saved settings
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.body.setAttribute('data-theme', savedTheme);
    themeOptions.forEach(option => {
      option.classList.toggle('active', option.dataset.theme === savedTheme);
    });
  }

  const savedLang = localStorage.getItem('language') || 'en';
  if (savedLang) {
    languageOptions.forEach(option => {
      option.classList.toggle('active', option.dataset.lang === savedLang);
    });
    updateLanguage(savedLang);
  }

  // Add logo click handler
  const logo = document.querySelector('.logo');
  if (logo) {
    logo.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      filterAnimeByCategory('Home');
    });
  }
});

// Update the hero slider interval
function updateHeroSlider(animeList) {
  const heroSlide = document.querySelector('.hero-slide');
  let currentSlide = 0;
  let slideInterval = null;

  // Add safety check
  if (!animeList || !Array.isArray(animeList) || animeList.length === 0) {
    console.warn('No valid anime data for hero slider');
    heroSlide.innerHTML = `
      <div class="slide-content">
        <h2>Loading Latest Anime...</h2>
        <p>Please wait while we fetch the content...</p>
      </div>
      <div class="slide-overlay"></div>
      <div class="slide-bg"></div>
    `;
    return;
  }

  // Clear any existing interval
  if (window.heroSliderInterval) {
    clearInterval(window.heroSliderInterval);
    window.heroSliderInterval = null;
  }

  async function fetchBannerImage(anime) {
    try {
      // First check if we have the banner in cache
      if (cache.detailedAnime.has(anime.id)) {
        const cachedData = cache.detailedAnime.get(anime.id);
        if (cachedData?.Media?.bannerImage) {
          return cachedData.Media.bannerImage;
        }
      }

      // If not in cache, fetch from AniList
      const query = `
        query ($id: Int) {
          Media (id: $id, type: ANIME) {
            bannerImage
            coverImage {
              extraLarge
              large
            }
            title {
              english
              romaji
            }
          }
        }
      `;

      const data = await fetchFromAniList(query, { id: parseInt(anime.id) });
      
      // Return banner image if available
      if (data?.Media?.bannerImage) {
        return data.Media.bannerImage;
      } 
      // First fallback: extra large cover image
      else if (data?.Media?.coverImage?.extraLarge) {
        return data.Media.coverImage.extraLarge;
      }
      // Second fallback: large cover image
      else if (data?.Media?.coverImage?.large) {
        return data.Media.coverImage.large;
      }
      // Final fallback: original image from anime data
      return anime.image;

    } catch (error) {
      console.warn('Error fetching banner:', error);
      return anime.image; // Fallback to regular image
    }
  }

  async function updateSlide() {
    try {
      const anime = animeList[currentSlide];
      if (!anime) return;

      // Set the anime ID on the hero slide
      heroSlide.dataset.animeId = anime.id;

      // Clean up synopsis text
      const cleanSynopsis = anime.synopsis ? 
        anime.synopsis
          .replace(/<[^>]*>/g, '')
          .replace(/\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() : 
        'No description available.';

      // Show loading state while fetching banner
      heroSlide.querySelector('.slide-bg').style.opacity = '0.5';
      
      // Fetch banner image
      const bannerImage = await fetchBannerImage(anime);
      
      // Check watchlist status
      checkWatchlistStatus(anime.id);

      // Clear existing interval before updating content
      if (slideInterval) {
        clearInterval(slideInterval);
      }

      heroSlide.innerHTML = `
        <div class="slide-content">
          <h2>${anime.title || 'Loading...'}</h2>
          <p class="description">${cleanSynopsis}</p>
          ${cleanSynopsis.length > 200 ? `
            <button class="read-more-btn">
              Read More
              <i class="fas fa-chevron-down icon"></i>
            </button>
          ` : ''}
          <div class="genre-tags">
            ${(anime.genres || []).map(genre => `<span class="genre-tag">${genre}</span>`).join('')}
          </div>

          <div class="slide-buttons">
            <button class="watch-now" onclick="
              document.querySelectorAll('.anime-details-modal').forEach(modal => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 100);
              });
              initializeVideoPlayer({
                id: '${anime.id}',
                title: '${anime.title ? anime.title.replace(/'/g, "\\'") : 'Unknown Anime'}',
                episodes: ${anime.episodes || 1},
                image: '${anime.image || ''}'
              });
            ">
              <i class="fas fa-play"></i> Watch Now
            </button>
            <button class="add-list" onclick="addToWatchlist('${anime.id}')">
              <i class="fas fa-plus"></i> Add to List
            </button>
          </div>
        </div>
        <div class="slide-overlay"></div>
        <div class="slide-bg" style="background-image: url('${bannerImage}')"></div>
      `;

      // Add enhanced slide animations
      const slideBg = heroSlide.querySelector('.slide-bg');
      if (slideBg) {
        slideBg.style.animation = 'fadeZoom 5s ease-in-out forwards';
        slideBg.addEventListener('animationend', () => {
          slideBg.style.animation = '';
        });
      }

      // Handle read more functionality
      const description = heroSlide.querySelector('.description');
      const readMoreBtn = heroSlide.querySelector('.read-more-btn');
      
      if (readMoreBtn && description) {
        readMoreBtn.addEventListener('click', () => {
          description.classList.toggle('expanded');
          const isExpanded = description.classList.contains('expanded');
          readMoreBtn.innerHTML = isExpanded ? 
            'Read Less <i class="fas fa-chevron-up icon"></i>' : 
            'Read More <i class="fas fa-chevron-down icon"></i>';
        });
      }

    } catch (error) {
      console.error('Error updating hero slide:', error);
      heroSlide.innerHTML = `
        <div class="slide-content">
          <h2>Error Loading Content</h2>
          <p>Please try refreshing the page</p>
        </div>
        <div class="slide-overlay"></div>
        <div class="slide-bg"></div>
      `;
    }
  }

  // Initialize first slide
  updateSlide();

  // Set up auto-rotation with proper clearing
  window.heroSliderInterval = setInterval(() => {
    try {
      currentSlide = (currentSlide + 1) % animeList.length;
      updateSlide();
    } catch (err) {
      if (window.heroSliderInterval) {
        clearInterval(window.heroSliderInterval);
      }
    }
  }, 5000);

  // Clean up interval on page unload
  window.addEventListener('unload', () => {
    if (window.heroSliderInterval) {
      clearInterval(window.heroSliderInterval);
    }
  });
}

// Cache cleanup function
function cleanupCache() {
  const now = Date.now();
  
  // Clean section cache
  cache.sectionData.forEach((value, key) => {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.sectionData.delete(key);
    }
  });

  // Clean anime details cache
  if (cache.detailedAnime.size > 200) {
    const entries = Array.from(cache.detailedAnime.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    // Keep only the 100 most recent entries
    cache.detailedAnime.clear();
    entries.slice(0, 100).forEach(([key, value]) => {
      cache.detailedAnime.set(key, value);
    });
  }

  // Clean expired timestamps
  Object.keys(cache.lastFetch).forEach(key => {
    if (now - cache.lastFetch[key] > CACHE_DURATION) {
      cache.lastFetch[key] = 0;
      cache[key] = null;
    }
  });
}

// Run cleanup periodically
setInterval(cleanupCache, 300000);

// Bulk fetch anime details for efficiency
async function bulkFetchAnimeDetails(ids) {
  if (!ids || ids.length === 0) return {};
  
  // Create batches of 10 IDs to avoid overloading the API
  const batches = [];
  for (let i = 0; i < ids.length; i += 10) {
    batches.push(ids.slice(i, i + 10));
  }
  
  const results = {};
  
  for (const batch of batches) {
    try {
      const query = `
        query ($ids: [Int]) {
          Page {
            media(id_in: $ids, type: ANIME, isAdult: false, countryOfOrigin: "JP") {
              id
              title {
                romaji
                english
                native
              }
              description
              episodes
              duration
              status
              startDate {
                year
                month
                day
              }
              endDate {
                year
                month
                day
              }
              season
              seasonYear
              format
              source
              genres
              tags {
                id
                name
                rank
              }
              averageScore
              popularity
              studios {
                nodes {
                  id
                  name
                }
              }
              coverImage {
                extraLarge
                large
              }
              bannerImage
            }
          }
        }
      `;
      
      const data = await fetchFromAniList(query, { ids: batch });
      
      if (data?.Page?.media) {
        data.Page.media.forEach(anime => {
          results[anime.id] = anime;
        });
      }
      
      // Add a short delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('Error in bulk fetch:', error);
    }
  }
  
  // Cache new results
  Object.entries(results).forEach(([id, data]) => {
    cache.detailedAnime.set(id, {
      data,
      timestamp: Date.now()
    });
  });

  return results;
}

// Language translations
const translations = {
  en: {
    logo: "AnimeRealm",
    searchPlaceholder: "Search anime...",
    home: "Home",
    movies: "Movies",
    tvSeries: "TV Series",
    popular: "Popular",
    recentlyAdded: "Recently Added",
    signIn: "Sign In",
    editProfile: "Edit Profile",
    watchlist: "Watchlist",
    settings: "Settings",
    signOut: "Sign Out",
    footer: {
      tagline: "Your gateway to the world of anime",
      quickLinks: "Quick Links",
      connect: "Connect",
      copyright: " 2025 AnimeRealm. All rights reserved."
    },
    chat: {
      title: "Community Chat",
      online: "online",
      loginPrompt: "Please sign in to participate in the chat",
      inputPlaceholder: "Type a message..."
    }
  },
  es: {
    logo: "AnimeRealm",
    searchPlaceholder: "Buscar anime...",
    home: "Inicio",
    movies: "Películas",
    tvSeries: "Series",
    popular: "Popular",
    recentlyAdded: "Recién Agregado",
    signIn: "Iniciar Sesión",
    editProfile: "Editar Perfil",
    watchlist: "Lista",
    settings: "Configuración",
    signOut: "Cerrar Sesión",
    footer: {
      tagline: "Tu puerta de entrada al mundo del anime",
      quickLinks: "Enlaces Rápidos",
      connect: "Conectar",
      copyright: " 2025 AnimeRealm. Todos los derechos reservados."
    },
    chat: {
      title: "Chat Comunitario",
      online: "en línea",
      loginPrompt: "Inicia sesión para participar en el chat",
      inputPlaceholder: "Escribe un mensaje..."
    }
  },
  fr: {
    logo: "AnimeRealm",
    searchPlaceholder: "Rechercher un anime...",
    home: "Accueil",
    movies: "Films",
    tvSeries: "Séries",
    popular: "Populaire",
    recentlyAdded: "Récemment Ajouté",
    signIn: "Se Connecter",
    editProfile: "Modifier le Profil",
    watchlist: "Liste",
    settings: "Paramètres",
    signOut: "Déconnexion",
    footer: {
      tagline: "Votre portail vers le monde de l'anime",
      quickLinks: "Liens Rapides",
      connect: "Connexion",
      copyright: " 2025 AnimeRealm. Tous droits réservés."
    },
    chat: {
      title: "Chat Communautaire",
      online: "en ligne",
      loginPrompt: "Connectez-vous pour participer au chat",
      inputPlaceholder: "Écrivez un message..."
    }
  },
  ja: {
    logo: "アニメレルム",
    searchPlaceholder: "アニメを検索...",
    home: "ホーム",
    movies: "映画",
    tvSeries: "TVシリーズ",
    popular: "人気",
    recentlyAdded: "新着",
    signIn: "ログイン",
    editProfile: "プロフィール編集",
    watchlist: "ウォッチリスト",
    settings: "設定",
    signOut: "ログアウト",
    footer: {
      tagline: "アニメの世界への入り口",
      quickLinks: "クイックリンク",
      connect: "つながる",
      copyright: " 2025 AnimeRealm. 全著作権所有。"
    },
    chat: {
      title: "コミュニティチャット",
      online: "オンライン",
      loginPrompt: "チャットに参加するにはログインしてください",
      inputPlaceholder: "メッセージを入力..."
    }
  }
};

// Function to update page text based on selected language
function updateLanguage(lang) {
  const elements = document.querySelectorAll('[data-translate]');
  elements.forEach(element => {
    const key = element.getAttribute('data-translate');
    if (translations[lang] && translations[lang][key]) {
      element.textContent = translations[lang][key];
    }
  });

  // Update header elements
  document.querySelector('.logo').textContent = translations[lang].logo;
  document.getElementById('search').placeholder = translations[lang].searchPlaceholder;
  
  // Update navigation links
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks[0].textContent = translations[lang].home;
  navLinks[1].textContent = translations[lang].movies;
  navLinks[2].textContent = translations[lang].tvSeries;
  navLinks[3].textContent = translations[lang].popular;
  navLinks[4].textContent = translations[lang].recentlyAdded;
  
  // Update auth button
  const authButton = document.getElementById('authButton');
  if (authButton) {
    authButton.textContent = translations[lang].signIn;
  }

  // Update dropdown menu
  const dropdownLinks = document.querySelectorAll('.dropdown-content a');
  dropdownLinks.forEach(link => {
    if (link.querySelector('i.fa-user-edit')) {
      link.textContent = translations[lang].editProfile;
    } else if (link.querySelector('i.fa-list')) {
      link.textContent = translations[lang].watchlist;
    } else if (link.querySelector('i.fa-cog')) {
      link.textContent = translations[lang].settings;
    } else if (link.querySelector('i.fa-sign-out-alt')) {
      link.textContent = translations[lang].signOut;
    }
  });

  // Update footer content
  document.querySelector('.footer-section h3').textContent = translations[lang].logo;
  document.querySelector('.footer-section p').textContent = translations[lang].footer.tagline;
  
  const footerSections = document.querySelectorAll('.footer-section h3');
  footerSections[1].textContent = translations[lang].footer.quickLinks;
  footerSections[2].textContent = translations[lang].footer.connect;
  
  // Update quick links
  const quickLinks = document.querySelectorAll('.footer-section:nth-child(2) a');
  quickLinks[0].textContent = translations[lang].home;
  quickLinks[1].textContent = translations[lang].movies;
  quickLinks[2].textContent = translations[lang].tvSeries;
  quickLinks[3].textContent = translations[lang].popular;
  quickLinks[4].textContent = translations[lang].recentlyAdded;
  
  // Update copyright
  document.querySelector('.footer-bottom p').textContent = translations[lang].footer.copyright;

  // Update chat elements
  document.querySelector('.chat-header h2').textContent = translations[lang].chat.title;
  document.querySelector('.online-count span').nextSibling.textContent = ' ' + translations[lang].chat.online;
  document.querySelector('#chatLoginPrompt').textContent = translations[lang].chat.loginPrompt;
  document.querySelector('#chatInput').placeholder = translations[lang].chat.inputPlaceholder;

  // Save language preference
  localStorage.setItem('language', lang);
}

// Enhanced getAnimeVideoUrl function
function getAnimeVideoUrl() {
  // Return empty string as we're removing video functionality
  return '';
}

// Add seasonal anime loading function
async function loadSeasonalAnime() {
  try {
    // Determine current season
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    let season;
    let year = now.getFullYear();
    
    if (month >= 1 && month <= 3) season = 'WINTER';
    else if (month >= 4 && month <= 6) season = 'SPRING';
    else if (month >= 7 && month <= 9) season = 'SUMMER';
    else {
      season = 'FALL';
      // For late December, show next year's winter anime
      if (month === 12 && now.getDate() > 15) {
        season = 'WINTER';
        year++;
      }
    }
    
    console.log(`Loading seasonal anime: ${season} ${year}`);
    
    // Fetch seasonal anime data
    const seasonalData = await fetchFromAniList(SEASONAL_QUERY, {
      season: season,
      seasonYear: year,
      page: 1
    }, 'seasonal');
    
    // Update cache
    if (seasonalData?.Page?.media) {
      cache.seasonal = seasonalData.Page.media;
      cache.lastFetch.seasonal = Date.now();
    }
  } catch (error) {
    console.error('Error loading seasonal anime:', error);
  }
}

// Function to return to home page
function returnToHome() {
  window.currentView = 'home';
  filterAnimeByCategory('Home');
}

// Update the navigation function for all sections
function navigateSection(section) {
  // First update the nav links active state
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.textContent === section) {
      link.classList.add('active');
    }
  });

  // Check for special sections
  if (section === 'Watchlist') {
    showWatchlist();
  } else {
    // Filter content for standard sections
    filterAnimeByCategory(section);
  }

  // Smooth scroll to trending section
  const trendingSection = document.querySelector('.trending');
  if (trendingSection) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}

// Utility function to format a date
function formatDate(dateObj) {
  if (!dateObj) return 'TBA';
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = dateObj.year;
  const month = months[dateObj.month - 1];
  const day = dateObj.day;
  
  return `${month} ${day}, ${year}`;
}

// Function to get season color
function getSeasonColor(season) {
  switch(season) {
    case 'WINTER': return '#a8d0e6'; // Light blue
    case 'SPRING': return '#8ac6d1'; // Teal
    case 'SUMMER': return '#f9a826'; // Orange
    case 'FALL': return '#dd6e42';   // Burnt orange
    default: return '#6c63ff';       // Default primary color
  }
}

// Debounce function to prevent too many API calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Search functionality with debouncing
document.getElementById('search').addEventListener('input', debounce(async function(e) {
  const searchTerm = e.target.value.trim();
  const trendingGrid = document.getElementById('trending-grid');
  const recentGrid = document.getElementById('recent-grid');
  const trendingHeading = document.querySelector('.trending h2');
  const recentHeading = document.querySelector('.recently-updated h2');

  // Reset to home page content when search is cleared
  if (searchTerm.length === 0) {
    if (trendingHeading) trendingHeading.textContent = '🔥 Trending Now';
    if (recentHeading) recentHeading.textContent = '📺 Recently Updated';
    initializeAnimeData();
    searchResultsDropdown.style.display = 'none';
    return;
  }

  // Update headings
  if (trendingHeading) trendingHeading.textContent = `🔍 Search Results: "${searchTerm}"`;
  if (recentHeading) recentHeading.textContent = `📺 Related Anime`;

  try {
    // Fetch search results
    const SEARCH_QUERY = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC], isAdult: false) {
            id
            title {
              romaji
              english
              native
            }
            description
            episodes
            status
            seasonYear
            season
            format
            averageScore
            popularity
            coverImage {
              large
            }
            genres
            studios {
              nodes {
                name
              }
            }
            nextAiringEpisode {
              episode
              airingAt
              timeUntilAiring
            }
          }
        }
      }
    `;

    // Show loading state
    if (trendingGrid) {
      trendingGrid.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Searching for "${searchTerm}"...</p>
        </div>
      `;
    }

    if (recentGrid) {
      recentGrid.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Finding related content...</p>
        </div>
      `;
    }

    // Fetch search results
    const searchData = await fetchFromAniList(SEARCH_QUERY, {
      search: searchTerm,
      page: 1,
      perPage: 24
    });

    if (searchData?.Page?.media && searchData.Page.media.length > 0) {
      // Clear and populate search results
      if (trendingGrid) {
        trendingGrid.innerHTML = '';
        searchData.Page.media.forEach(anime => {
          const animeData = convertAnimeData(anime);
          if (animeData) {
            trendingGrid.appendChild(createAnimeCard(animeData));
          }
        });
      }

      // Get genres from first few results for related content
      const genres = new Set();
      searchData.Page.media.slice(0, 3).forEach(anime => {
        if (anime.genres) {
          anime.genres.forEach(genre => genres.add(genre));
        }
      });

      // Fetch related anime based on genres
      if (genres.size > 0) {
        const RELATED_QUERY = `
          query ($genres: [String], $page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              media(genre_in: [${Array.from(genres).map(g => `"${g}"`).join(', ')}], 
                    type: ANIME, 
                    sort: POPULARITY_DESC, 
                    isAdult: false) {
                id
                title {
                  romaji
                  english
                  native
                }
                description
                episodes
                status
                seasonYear
                season
                format
                averageScore
                popularity
                coverImage {
                  large
                }
                genres
                studios {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        `;

        const relatedData = await fetchFromAniList(RELATED_QUERY, {
          page: 1,
          perPage: 24
        });

        if (recentGrid && relatedData?.Page?.media) {
          recentGrid.innerHTML = '';
          
          // Filter out anime that are already in search results
          const searchIds = new Set(searchData.Page.media.map(a => a.id));
          relatedData.Page.media
            .filter(anime => !searchIds.has(anime.id))
            .forEach(anime => {
              const animeData = convertAnimeData(anime);
              if (animeData) {
                recentGrid.appendChild(createAnimeCard(animeData));
              }
            });
        }
      }

    } else {
      // No results found
      if (trendingGrid) {
        trendingGrid.innerHTML = `
          <div class="error-state">
            <i class="fas fa-search"></i>
            <p>No results found for "${searchTerm}"</p>
            <p>Try different keywords or check your spelling</p>
            <button onclick="filterAnimeByCategory('Home')" class="retry-btn">
              <i class="fas fa-home"></i> Return to Home
            </button>
          </div>
        `;
      }

      // Show popular anime as suggestions
      if (recentGrid) {
        const popularData = await fetchFromAniList(POPULAR_QUERY, {
          page: 1,
          perPage: 24
        });

        if (popularData?.Page?.media) {
          recentGrid.innerHTML = '';
          popularData.Page.media.forEach(anime => {
            const animeData = convertAnimeData(anime);
            if (animeData) {
              recentGrid.appendChild(createAnimeCard(animeData));
            }
          });
        }
      }
    }

  } catch (error) {
    console.error('Search error:', error);
    if (trendingGrid) {
      trendingGrid.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error searching for "${searchTerm}"</p>
          <p>Please try again later</p>
          <button onclick="filterAnimeByCategory('Home')" class="retry-btn">
            <i class="fas fa-home"></i> Return to Home
          </button>
        </div>
      `;
    }
    if (recentGrid) {
      recentGrid.innerHTML = '';
    }
  }
}, 500));

// Add Enter key handler for search
document.getElementById('search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const searchTerm = e.target.value.trim();
    if (searchTerm.length > 0) {
      e.target.blur(); // Remove focus from search input
      searchResultsDropdown.style.display = 'none'; // Hide dropdown
      // Trigger search
      const event = new Event('input');
      e.target.dispatchEvent(event);
    }
  }
});

// Add watchlist functionality
function addToWatchlist(animeId) {
  window.supabase.auth.getSession().then(({ data: { session } }) => {
    const user = session?.user;
    
    if (!user) {
      // Show auth modal if not logged in
      const authModal = document.getElementById('authModal');
      if (authModal) {
        authModal.style.display = 'flex';
        authModal.classList.add('show');
      }
      return;
    }

    // Use Supabase for watchlist instead of Firebase
    const checkWatchlist = async () => {
      try {
        const { data: existingItem, error: checkError } = await window.supabase
          .from('watchlist')
          .select('id')
          .eq('user_id', user.id)
          .eq('anime_id', animeId)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (existingItem) {
          // Remove from watchlist
          const { error } = await window.supabase
            .from('watchlist')
            .delete()
            .eq('id', existingItem.id);

          if (error) throw error;

          showToast("Removed from watchlist", 'success');
          updateWatchlistButtons(animeId, false);
        } else {
          // Get cached anime data if available
          let animeData = null;
          if (cache.detailedAnime && cache.detailedAnime.has(animeId)) {
            const cachedData = cache.detailedAnime.get(animeId);
            animeData = cachedData?.Media;
          }
          
          // Fetch details if missing to avoid "Unknown Anime"
          if (!animeData) {
            try {
              const detailed = await fetchFromAniList(DETAILED_ANIME_QUERY, { id: parseInt(animeId, 10) });
              animeData = detailed?.Media || null;
            } catch (e) { console.warn('Backfill fetch failed:', e); }
          }
          
          // Add to watchlist
          const { error } = await window.supabase
            .from('watchlist')
            .insert({
              user_id: user.id,
              anime_id: animeId,
              title: animeData?.title?.english || animeData?.title?.romaji || (typeof animeId === 'string' ? `Anime #${animeId}` : 'Unknown Anime'),
              image_url: animeData?.coverImage?.large || animeData?.coverImage?.extraLarge || '',
              added_at: new Date().toISOString()
            });

          if (error) throw error;

          showToast("Added to watchlist", 'success');
          updateWatchlistButtons(animeId, true);
        }
      } catch (error) {
        console.error("Watchlist error:", error);
        showToast("Failed to update watchlist", 'error');
      }
    };

    checkWatchlist();
  });
}

// Update watchlist buttons UI
function updateWatchlistButtons(animeId, isInWatchlist) {
  // Update any watchlist buttons that match this anime ID
  document.querySelectorAll(`.add-list-btn[data-anime-id="${animeId}"]`).forEach(btn => {
    if (isInWatchlist) {
      btn.innerHTML = '<i class="fas fa-check"></i> In List';
    } else {
      btn.innerHTML = '<i class="fas fa-plus"></i> Add to List';
    }
  });
  
  // Also update hero slide button if it's for the same anime
  const addListBtn = document.querySelector('.hero-slide .add-list');
  const heroSlideAnimeId = document.querySelector('.hero-slide')?.dataset?.animeId;
  if (addListBtn && String(heroSlideAnimeId) === String(animeId)) {
    addListBtn.innerHTML = isInWatchlist ? '<i class="fas fa-check"></i> In List'
                                         : '<i class="fas fa-plus"></i> Add to List';
  }
}

// Show watchlist function
function showWatchlist() {
  // Lock view to watchlist so home refresh doesn't override
  window.currentView = 'watchlist';
  
  window.supabase.auth.getSession().then(async ({ data: { session } }) => {
    const user = session?.user;
    
    if (!user) {
      // Show auth modal if not logged in
      const authModal = document.getElementById('authModal');
      if (authModal) {
        authModal.style.display = 'flex';
        authModal.classList.add('show');
      }
      return;
    }
      
      // Update UI to show watchlist content
      const trendingHeading = document.querySelector('.trending h2');
      const recentHeading = document.querySelector('.recently-updated h2');
      const trendingGrid = document.getElementById('trending-grid');
      const recentGrid = document.getElementById('recent-grid');
      
      if (trendingHeading) trendingHeading.textContent = '📋 My Watchlist';
      if (recentHeading) recentHeading.textContent = '🕓 Recently Added to Watchlist';
      
      if (trendingGrid) {
        trendingGrid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading watchlist...</p></div>';
      }
      if (recentGrid) {
        recentGrid.innerHTML = '';
      }
      
      try {
        // Get watchlist data from Supabase
        const { data: watchlist, error } = await window.supabase
          .from('watchlist')
          .select('*')
          .eq('user_id', user.id)
          .order('added_at', { ascending: false });
        
        // Backfill unknown entries with AniList data before rendering
        for (const item of watchlist) {
          if (!item.title || item.title === 'Unknown Anime' || !item.image_url) {
            try {
              const detail = await fetchFromAniList(DETAILED_ANIME_QUERY, { id: parseInt(item.anime_id, 10) });
              const media = detail?.Media;
              if (media) {
                item.title = media.title?.english || media.title?.romaji || item.title;
                item.image_url = media.coverImage?.large || media.coverImage?.extraLarge || item.image_url;
                window.supabase.from('watchlist').update({ title: item.title, image_url: item.image_url }).eq('id', item.id);
              }
            } catch (e) { console.warn('Watchlist backfill failed:', e); }
          }
        }
        
        if (trendingGrid) {
          trendingGrid.innerHTML = '';
          // Display all watchlist items
          watchlist.forEach(item => {
            const animeCard = createWatchlistCard(item);
            trendingGrid.appendChild(animeCard);
          });
        }
        
        // Show most recently added items in second section (last 4 weeks)
        if (recentGrid && watchlist.length > 0) {
          recentGrid.innerHTML = '';
          const fourWeeksAgo = new Date(Date.now() - (28 * 24 * 60 * 60 * 1000)).toISOString();
          const recentItems = watchlist.filter(item => item.added_at > fourWeeksAgo);
          
          if (recentItems.length > 0) {
            recentItems.forEach(item => {
              const animeCard = createWatchlistCard(item);
              recentGrid.appendChild(animeCard);
            });
          } else {
            recentGrid.innerHTML = `
              <div class="error-state">
                <i class="fas fa-clock"></i>
                <p>No items added recently</p>
              </div>
            `;
          }
        }
      } catch (error) {
        console.error("Error fetching watchlist:", error);
        if (trendingGrid) {
          trendingGrid.innerHTML = `
            <div class="error-state">
              <i class="fas fa-exclamation-circle"></i>
              <p>Failed to load watchlist</p>
              <button onclick="showWatchlist()" class="retry-btn">
                <i class="fas fa-redo"></i> Retry
              </button>
            </div>
          `;
        }
      }
  });
}

// Create a watchlist card
function createWatchlistCard(item) {
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.dataset.animeId = item.anime_id;
  
  card.innerHTML = `
    <img src="${item.image_url || 'https://via.placeholder.com/250x350?text=No+Image'}" alt="${item.title}" 
         onerror="this.onerror=null; this.src='https://via.placeholder.com/250x350?text=No+Image'" loading="lazy">
    <div class="anime-card-content">
      <h3>${item.title}</h3>
      <div class="meta">
        <span>${new Date(item.added_at).toLocaleDateString()}</span>
      </div>
      <div class="watchlist-actions" style="margin-top: 10px; display: flex; gap: 5px;">
        <button class="watch-btn" style="flex: 1; padding: 8px; font-size: 0.9rem;" 
                onclick="
                  document.querySelectorAll('.anime-details-modal').forEach(modal => {
                    modal.classList.remove('show');
                    setTimeout(() => modal.remove(), 100);
                  });
                  initializeVideoPlayer({
                    id: '${item.anime_id}',
                    title: '${item.title.replace(/'/g, "\\'")}',
                    episodes: 12,
                    image: '${item.image_url}'
                  });
                ">
          <i class="fas fa-play"></i> Watch
        </button>
        <button class="remove-btn" style="flex: 1; padding: 8px; font-size: 0.9rem; background: var(--secondary-color);" 
                onclick="event.stopPropagation(); addToWatchlist('${item.anime_id}')">
          <i class="fas fa-trash"></i> Remove
        </button>
      </div>
    </div>
  `;
  
  // Add click handler for card (show details)
  card.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
      // Only trigger if not clicking on a button
      showAnimeDetails({
        id: item.anime_id,
        title: item.title,
        image: item.image_url,
        episodes: 12 // Default episodes count
      });
    }
  });
  
  return card;
}

// Function to check if anime is in watchlist and update UI
function checkWatchlistStatus(animeId) {
  return window.supabase.auth.getSession().then(async ({ data: { session } }) => {
    const user = session?.user;
    if (!user) return Promise.resolve(false);
    
    try {
      const { data: watchlistItem, error } = await window.supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', user.id)
        .eq('anime_id', animeId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const isInWatchlist = !!watchlistItem;
      updateWatchlistButtons(animeId, isInWatchlist);
      return isInWatchlist;
    } catch (error) {
      console.error("Error checking watchlist status:", error);
      return false;
    }
  });
}

// Share anime function
function shareAnime(animeId) {
  if (!animeId) return;
  
  let shareUrl = `${window.location.origin}${window.location.pathname}?anime=${animeId}`;
  
  if (navigator.share) {
    navigator.share({
      title: 'Check out this anime!',
      url: shareUrl
    }).catch(err => {
      console.error('Share failed:', err);
      fallbackShare(shareUrl);
    });
  } else {
    fallbackShare(shareUrl);
  }
}

function fallbackShare(url) {
  try {
    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      prompt('Copy this link to share:', url);
    });
  } catch (err) {
    prompt('Copy this link to share:', url);
  }
}

// Check URL parameters for direct anime sharing
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedAnimeId = urlParams.get('anime');
  
  if (sharedAnimeId) {
    // If anime ID is in the URL, show that anime
    fetchFromAniList(DETAILED_ANIME_QUERY, { id: parseInt(sharedAnimeId) })
      .then(data => {
        if (data?.Media) {
          const media = data.Media;
          showAnimeDetails({
            id: media.id,
            title: media.title.english || media.title.romaji,
            image: media.coverImage.large,
            episodes: media.episodes || 12,
            rating: media.averageScore ? media.averageScore / 10 : 0,
            synopsis: media.description
          });
        }
      })
      .catch(err => {
        console.error('Error loading shared anime:', err);
      });
  }
  
  initializeAnimeData();
  loadSeasonalAnime();
});

// Create and inject search results dropdown container
const searchBar = document.querySelector('.search-bar');
const searchResultsDropdown = document.createElement('div');
searchResultsDropdown.className = 'search-results-dropdown';
searchResultsDropdown.style.display = 'none';
searchBar.appendChild(searchResultsDropdown);

// Add styles for the search results dropdown
const searchStyles = document.createElement('style');
searchStyles.textContent = `
  .search-bar {
    position: relative;
  }
  
  .search-results-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface-color);
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    margin-top: 5px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    border: 1px solid var(--border-color);
  }
  
  .search-result-item {
    display: flex;
    align-items: center;
    padding: 10px;
    gap: 10px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid var(--border-color);
  }
  
  .search-result-item:last-child {
    border-bottom: none;
  }
  
  .search-result-item:hover {
    background-color: rgba(var(--primary-color-rgb), 0.1);
  }
  
  .search-result-thumbnail {
    width: 50px;
    height: 70px;
    border-radius: 4px;
    object-fit: cover;
  }
  
  .search-result-info {
    flex: 1;
  }
  
  .search-result-title {
    color: var(--text-color);
    font-weight: 500;
    margin-bottom: 4px;
    font-size: 0.9rem;
  }
  
  .search-result-details {
    color: var(--text-secondary);
    font-size: 0.8rem;
    display: flex;
    gap: 8px;
  }
  
  .search-result-badge {
    background: rgba(var(--primary-color-rgb), 0.1);
    color: var(--primary-color);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
  }
  
  .no-results {
    padding: 20px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  
  .loading-results {
    padding: 20px;
    text-align: center;
    color: var(--text-secondary);
  }
  
  .loading-results i {
    margin-right: 8px;
  }
  
  @media (max-width: 768px) {
    .search-results-dropdown {
      position: fixed;
      top: 140px;
      left: 10px;
      right: 10px;
      max-height: 60vh;
    }
  }
`;
document.head.appendChild(searchStyles);

// Add live search functionality with debouncing
let searchTimeout = null;
let lastQuery = '';

document.getElementById('search').addEventListener('input', function(e) {
  const query = e.target.value.trim();
  
  // Clear previous timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  // Hide results if search is empty
  if (!query) {
    searchResultsDropdown.style.display = 'none';
    lastQuery = '';
    return;
  }
  
  // Show loading state immediately if query changed
  if (query !== lastQuery) {
    searchResultsDropdown.style.display = 'block';
    searchResultsDropdown.innerHTML = `
      <div class="loading-results">
        <i class="fas fa-spinner fa-spin"></i>
        Searching...
      </div>
    `;
  }
  
  // Debounce search request
  searchTimeout = setTimeout(async () => {
    if (query === lastQuery) return;
    lastQuery = query;
    
    try {
      const LIVE_SEARCH_QUERY = `
        query ($search: String) {
          Page(page: 1, perPage: 8) {
            media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                medium
              }
              format
              episodes
              status
              seasonYear
              averageScore
              popularity
            }
          }
        }
      `;
      
      const data = await fetchFromAniList(LIVE_SEARCH_QUERY, {
        search: query
      });
      
      if (!data?.Page?.media || data.Page.media.length === 0) {
        searchResultsDropdown.innerHTML = `
          <div class="no-results">
            <i class="fas fa-search"></i>
            <p>No results found for "${query}"</p>
          </div>
        `;
        return;
      }
      
      // Render results
      searchResultsDropdown.innerHTML = data.Page.media.map(anime => `
        <div class="search-result-item" data-anime-id="${anime.id}">
          <img 
            src="${anime.coverImage?.medium || 'https://via.placeholder.com/50x70'}" 
            alt="${anime.title.english || anime.title.romaji}"
            class="search-result-thumbnail"
            onerror="this.src='https://via.placeholder.com/50x70'"
            loading="lazy"
          >
          <div class="search-result-info">
            <div class="search-result-title">${anime.title.english || anime.title.romaji}</div>
            <div class="search-result-details">
              <span class="search-result-badge">${anime.format || 'Unknown'}</span>
              ${anime.episodes ? `<span>${anime.episodes} Episodes</span>` : ''}
              ${anime.averageScore ? `<span>⭐ ${(anime.averageScore / 10).toFixed(1)}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('');
      
      // Add click handlers for results
      searchResultsDropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const animeId = item.dataset.animeId;
          if (animeId) {
            // Load and show anime details
            fetchFromAniList(DETAILED_ANIME_QUERY, { id: parseInt(animeId) })
              .then(data => {
                if (data?.Media) {
                  const animeData = convertAnimeData(data.Media);
                  if (animeData) {
                    showAnimeDetails(animeData);
                    // Clear search
                    document.getElementById('search').value = '';
                    searchResultsDropdown.style.display = 'none';
                  }
                }
              })
              .catch(error => console.error('Error loading anime details:', error));
          }
        });
      });
      
    } catch (error) {
      console.error('Live search error:', error);
      searchResultsDropdown.innerHTML = `
        <div class="no-results">
          <i class="fas fa-exclamation-circle"></i>
          <p>Failed to load results</p>
        </div>
      `;
    }
  }, 300); // 300ms debounce
});

// Hide search results when clicking outside
document.addEventListener('click', (e) => {
  if (!searchBar.contains(e.target)) {
    searchResultsDropdown.style.display = 'none';
  }
});

// Prevent form submission on enter
document.querySelector('.search-bar').addEventListener('submit', (e) => {
  e.preventDefault();
});

// Show results dropdown when focusing on search input
document.getElementById('search').addEventListener('focus', function(e) {
  const query = e.target.value.trim();
  if (query) {
    searchResultsDropdown.style.display = 'block';
  }
});

// Add keyboard navigation for search results
document.getElementById('search').addEventListener('keydown', function(e) {
  const results = searchResultsDropdown.querySelectorAll('.search-result-item');
  const activeResult = searchResultsDropdown.querySelector('.search-result-item.active');
  
  switch(e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (!activeResult) {
        results[0]?.classList.add('active');
      } else {
        const nextResult = activeResult.nextElementSibling;
        if (nextResult) {
          activeResult.classList.remove('active');
          nextResult.classList.add('active');
          nextResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      if (activeResult) {
        const prevResult = activeResult.previousElementSibling;
        if (prevResult) {
          activeResult.classList.remove('active');
          prevResult.classList.add('active');
          prevResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      break;
      
    case 'Enter':
      if (activeResult) {
        e.preventDefault();
        activeResult.click();
      }
      break;
      
    case 'Escape':
      searchResultsDropdown.style.display = 'none';
      break;
  }
});

// Enhanced UX features and quality-of-life improvements
document.addEventListener('DOMContentLoaded', () => {
  // Initialize UX enhancements
  initializeKeyboardShortcuts();
  initializeScrollToTop();
  initializeToastSystem();
  initializeSearchHistory();
  initializeLoadingStates();
  initializeAccessibilityFeatures();
  
  // PWA functionality
  initializePWA();
  
  // ...existing initialization code...
});

// Toast notification system
function showToast(message, type = 'info', duration = 5000) {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  
  toastContainer.appendChild(toast);
  
  // Show toast with animation
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Auto remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Enhanced loading overlay
function showLoadingOverlay(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.querySelector('p').textContent = message;
    overlay.classList.add('show');
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
}

// Keyboard shortcuts system
function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      // Allow Esc to blur inputs
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }
    
    switch(true) {
      case e.ctrlKey && e.key === 'k':
        e.preventDefault();
        document.getElementById('search').focus();
        break;
        
      case e.ctrlKey && e.key === 'h':
        e.preventDefault();
        filterAnimeByCategory('Home');
        break;
        
      case e.ctrlKey && e.key === ',':
        e.preventDefault();
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.add('show');
        break;
        
      case e.ctrlKey && e.key === 'Enter':
        e.preventDefault();
        const chatHeader = document.querySelector('.chat-header');
        if (chatHeader) chatHeader.click();
        break;
        
      case e.key === '?':
        e.preventDefault();
        document.getElementById('shortcutsModal').style.display = 'flex';
        break;
        
      case e.key === 'Escape':
        // Close any open modals
        document.querySelectorAll('.modal.show, .anime-details-modal.show').forEach(modal => {
          modal.classList.remove('show');
          setTimeout(() => {
            if (modal.classList.contains('anime-details-modal')) {
              modal.remove();
            } else {
              modal.style.display = 'none';
            }
          }, 300);
        });
        document.getElementById('shortcutsModal').style.display = 'none';
        break;
    }
  });
}

// Scroll to top functionality
function initializeScrollToTop() {
  const scrollBtn = document.getElementById('scrollToTop');
  if (!scrollBtn) return;
  
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
      scrollBtn.classList.add('show');
    } else {
      scrollBtn.classList.remove('show');
    }
  });
  
  scrollBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

// Toast system initialization
function initializeToastSystem() {
  // Override alert function to use toasts
  window.originalAlert = window.alert;
  window.alert = function(message) {
    showToast(message, 'info');
  };
  
  // Remove buggy override of addToWatchlist to keep the correct implementation
  // const originalAddToWatchlist = window.addToWatchlist;
  // window.addToWatchlist = function(animeId) {
  //   const user = window.supabase.auth.getUser().then(({ data: { user } }) => user);
  //   if (!user) {
  //     showToast('Please sign in to manage your watchlist', 'warning');
  //     const authModal = document.getElementById('authModal');
  //     if (authModal) {
  //       authModal.style.display = 'flex';
  //       authModal.classList.add('show');
  //     }
  //     return;
  //   }
  //   ...
  // };
}

// Search history functionality
function initializeSearchHistory() {
  const searchInput = document.getElementById('search');
  const searchDropdown = document.querySelector('.search-results-dropdown');
  
  if (!searchInput || !searchDropdown) return;
  
  let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  
  // Save search to history
  function saveSearch(query) {
    if (!query || query.length < 2) return;
    
    // Remove if already exists and add to front
    searchHistory = searchHistory.filter(item => item !== query);
    searchHistory.unshift(query);
    
    // Keep only last 10 searches
    searchHistory = searchHistory.slice(0, 10);
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  }
  
  // Show search history when focusing empty search
  searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim() && searchHistory.length > 0) {
      showSearchHistory();
    }
  });
  
  function showSearchHistory() {
    searchDropdown.innerHTML = `
      <div class="search-history">
        <div class="search-history-title">Recent Searches</div>
        ${searchHistory.map(query => `
          <div class="search-history-item" data-query="${query}">
            <span>${query}</span>
            <button class="search-history-clear" data-query="${query}">&times;</button>
          </div>
        `).join('')}
        <button class="search-history-clear" onclick="clearSearchHistory()" 
                style="width: 100%; margin-top: 5px; padding: 5px; border: none; background: var(--background-color); color: var(--text-secondary); border-radius: 4px;">
          Clear All
        </button>
      </div>
    `;
    
    searchDropdown.style.display = 'block';
    
    // Add click handlers
    searchDropdown.querySelectorAll('.search-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-history-clear')) {
          e.stopPropagation();
          const query = e.target.dataset.query;
          removeFromSearchHistory(query);
          return;
        }
        
        const query = item.dataset.query;
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input'));
      });
    });
  }
  
  function removeFromSearchHistory(query) {
    searchHistory = searchHistory.filter(item => item !== query);
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
    if (searchHistory.length > 0) {
      showSearchHistory();
    } else {
      searchDropdown.style.display = 'none';
    }
  }
  
  window.clearSearchHistory = function() {
    searchHistory = [];
    localStorage.removeItem('searchHistory');
    searchDropdown.style.display = 'none';
  };
  
  // Save search when clicking on search results
  const originalShowAnimeDetails = window.showAnimeDetails;
  window.showAnimeDetails = function(...args) {
    const query = searchInput.value.trim();
    if (query) {
      saveSearch(query);
    }
    return originalShowAnimeDetails.apply(this, args);
  };
}

// Enhanced loading states
function initializeLoadingStates() {
  // Override fetchFromAniList to show loading for major operations
  const originalFetch = window.fetchFromAniList || fetchFromAniList;
  window.fetchFromAniList = async function(query, variables, cacheKey) {
    // Show loading for expensive operations
    if (query.includes('DETAILED_ANIME_QUERY') || query.includes('SEARCH_QUERY')) {
      showLoadingOverlay('Loading anime details...');
    }
    
    try {
      const result = await originalFetch(query, variables, cacheKey);
      return result;
    } finally {
      hideLoadingOverlay();
    }
  };
  
  // Add skeleton loading for anime grids
  function showSkeletonLoading(gridElement) {
    if (!gridElement) return;
    
    const skeletonCards = Array.from({length: 8}, () => `
      <div class="anime-card skeleton-loading">
        <div style="height: 250px; background: var(--surface-color);"></div>
        <div class="anime-card-content">
          <div style="height: 20px; background: var(--surface-color); margin-bottom: 10px; border-radius: 4px;"></div>
          <div style="height: 16px; background: var(--surface-color); width: 60%; border-radius: 4px;"></div>
        </div>
      </div>
    `).join('');
    
    gridElement.innerHTML = skeletonCards;
  }
  
  // Use skeleton loading in filter function
  const originalFilter = window.filterAnimeByCategory;
  window.filterAnimeByCategory = async function(category) {
    const trendingGrid = document.getElementById('trending-grid');
    const recentGrid = document.getElementById('recent-grid');
    
    showSkeletonLoading(trendingGrid);
    showSkeletonLoading(recentGrid);
    
    return originalFilter(category);
  };
}

// Accessibility features
function initializeAccessibilityFeatures() {
  // Add focus management for modals
  document.addEventListener('keydown', (e) => {
    const activeModal = document.querySelector('.modal.show, .anime-details-modal.show');
    if (activeModal && e.key === 'Tab') {
      trapFocus(e, activeModal);
    }
  });
  
  function trapFocus(e, modal) {
    const focusableElements = modal.querySelectorAll(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  }
  
  // Add ARIA labels to interactive elements
  document.querySelectorAll('.anime-card').forEach((card, index) => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View details for ${card.querySelector('h3')?.textContent || 'anime'}`);
    
    // Add keyboard support
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
  
  // Announce page changes to screen readers
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
  document.body.appendChild(announcer);
  
  window.announceToScreenReader = function(message) {
    announcer.textContent = message;
    setTimeout(() => announcer.textContent = '', 1000);
  };
}

// Auto-save functionality
function showAutoSaveIndicator() {
  const indicator = document.getElementById('autoSaveIndicator');
  if (indicator) {
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 2000);
  }
}

// Enhanced error handling with user-friendly messages
function handleError(error, userMessage = 'Something went wrong') {
  console.error('Application error:', error);
  showToast(userMessage, 'error');
  
  // Log to analytics if available
  if (window.gtag) {
    gtag('event', 'exception', {
      'description': error.toString(),
      'fatal': false
    });
  }
}

// Performance monitoring
function initializePerformanceMonitoring() {
  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) {
          console.warn('Long task detected:', entry.duration + 'ms');
        }
      }
    });
    observer.observe({entryTypes: ['longtask']});
  }
  
  // Monitor memory usage
  if (performance.memory) {
    setInterval(() => {
      const memInfo = performance.memory;
      if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.9) {
        console.warn('High memory usage detected');
        cleanupCache(); // Clean cache if memory is high
      }
    }, 30000);
  }
}

// PWA initialization and functionality
function initializePWA() {
  // Check online/offline status
  function updateOnlineStatus() {
    const offlineIndicator = document.querySelector('.offline-indicator') || createOfflineIndicator();
    if (navigator.onLine) {
      offlineIndicator.classList.remove('show');
      offlineIndicator.style.display = 'none';
      console.log('App is online');
    } else {
      offlineIndicator.style.display = 'block';
      offlineIndicator.classList.add('show');
      console.log('App is offline');
      showToast('You are offline. Some features may not work.', 'warning');
    }
  }
  
  function createOfflineIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'offline-indicator';
    indicator.innerHTML = '⚡ You are offline - Some features may not work';
    document.body.appendChild(indicator);
    // Hide by default; only show when truly offline
    indicator.style.display = 'none';
    return indicator;
  }

  // Listen for online/offline events
  window.addEventListener('online', () => updateOnlineStatus());
  window.addEventListener('offline', () => updateOnlineStatus());
  
  // Initial status check
  updateOnlineStatus();

  // Add to home screen detection (iOS Safari)
  if (window.navigator.standalone === false && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    setTimeout(() => {
      if (!localStorage.getItem('ios-install-dismissed')) {
        showIOSInstallPrompt();
      }
    }, 15000);
  }

  function showIOSInstallPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'pwa-ios-install';
    prompt.innerHTML = `
      <p>
        <i class="fas fa-mobile-alt ios-install-icon"></i>
        Install AnimeRealm: Tap <i class="fas fa-share"></i> then "Add to Home Screen"
      </p>
      <button onclick="this.parentElement.remove(); localStorage.setItem('ios-install-dismissed', 'true');" 
              style="background: var(--primary-color); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px;">
        Got it!
      </button>
    `;
    document.body.appendChild(prompt);
    setTimeout(() => prompt.classList.add('show'), 100);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      prompt.remove();
      localStorage.setItem('ios-install-dismissed', 'true');
    }, 10000);
  }

  // Background sync registration
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      // Register for background sync
      return registration.sync.register('background-sync');
    }).catch((error) => {
      console.log('Background sync registration failed:', error);
    });
  }

  // Store failed actions for retry when online
  window.storePendingAction = function(action) {
    if (!navigator.onLine) {
      const pendingActions = JSON.parse(localStorage.getItem('pendingActions') || '[]');
      pendingActions.push({
        ...action,
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9)
      });
      localStorage.setItem('pendingActions', JSON.stringify(pendingActions));
      showToast('Action saved. Will sync when online.', 'info');
    }
  };

  // Clear pending actions when online
  window.addEventListener('online', () => {
    const pendingActions = JSON.parse(localStorage.getItem('pendingActions') || '[]');
    if (pendingActions.length > 0) {
      showToast(`Syncing ${pendingActions.length} pending actions...`, 'info');
      // Service worker will handle the actual sync
    }
  });
}

// Initialize performance monitoring
initializePerformanceMonitoring();