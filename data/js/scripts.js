
/**
 * TODO:
 * fix double digit score
 */

const app = new Vue({
    el: '#app',
    data: {
        site_settings: {
            site_name: "Offico score",
        },
        timeframe: Date.now(),
        settings: {
            steam_id: "76561198020969037",
            matches_count: "50",
            hours_minus: 14,
            num_players: 2,
        },
        endpoints: {
            "last_matches": "https://aoe2.net/api/player/matches?game=aoe2de",
        },
        last_matches: [],
        score: {
            wins: 0,
            losses: 0,
            missing: false,
            elo_change: 0,
        },
        is_loading = false,
        current_match: {
            active: false,
            players: [],
        },
        periodic_check: {
            timer: false,
            interval: 60 * 1000,
        },
    },
    created() {

        // Override settings from url data.
        this.get_url_info();

        // Deduct hours from current time.
        this.change_hours();

        this.get_score();
        this.start_periodic_check();

    },
    computed: {
        last_matches_url: function() {
            return `${this.endpoints.last_matches}&steam_id=${this.settings.steam_id}&count=${this.settings.matches_count}`;
        },
    },
    methods: {
        get_url_info() {
            const url = new URL(window.location.href);
            const search_params = new URLSearchParams(url.search);

            // Available url parameters to override settings.
            const params = ["steam_id", "hours_minus", "matches_count", "num_players"];

            // Apply found url params to settings.
            for (let param of params) {
                if (search_params.has(param)) {
                    this.settings[param] = search_params.get(param);
                }
            }

        },
        change_hours() {
                
            const hours_minus = this.settings.hours_minus;

            const timeframe_object = new Date(this.timeframe);
            timeframe_object.setHours(timeframe_object.getHours() - hours_minus);
            this.timeframe = Date.parse(timeframe_object);

        },
        async get_last_matches() {

            // Get last matches from API.
            const result = await fetch(this.last_matches_url);
            const result_json = await result.json();

            // Store last matches from API.
            this.last_matches = result_json;

            return result_json;
        },
        get_score() {

            this.get_last_matches().then(last_matches => {
            
                if (last_matches.length < 1) {
                    console.log("matches not found")
                    return;
                }

                // Reset settings.
                this.reset_settings();
    
                // Loop through last matches.
                for (let i = 0; i < last_matches.length; i++) {
                    const match = last_matches[i];
    
                    const started_unix = match.started * 1000;
                    const finished_unix = match.finished * 1000;
                    const players = match.players;
                    const num_players = match.num_players;

                    // Skip games based on number of players.
                    if (num_players != this.settings.num_players) {
                        continue;
                    }
    
                    // Skip currently played game.
                    if (finished_unix == 0) {
                        this.current_match.active = true;
                        this.current_match.players = players;
                        continue;
                    }
    
                    // Skip games before timeframe.
                    if (finished_unix < this.timeframe) {
                        continue;
                    }
    
                    // Skip finished game without score data.
                    if (players[0].won == null) {
                        this.score.missing = true;
                        continue;
                    }
    
                    // Update score.
                    for (let j = 0; j < players.length; j++) {
                        const player = players[j];
    
                        if (player.steam_id == this.settings.steam_id) {

                            this.score.elo_change += player.rating_change;
    
                            if (player.won) {
                                this.score.wins++;
                            } else {
                                this.score.losses++;
                            }
                            
                        }
    
                    }
    
                }

                this.loading = false;
    
            });

        },
        reset_settings() {

            this.score.wins = 0;
            this.score.losses = 0;
            this.score.elo_change = 0;
            this.score.missing = false;
            this.current_match.active = false;

        },
        refresh_data() {

            if (this.loading) {
                return;
            }

            this.loading = true;

            this.get_score();

        },
        start_periodic_check() {

            if (this.periodic_check.timer) {
                return;
            }

            // Refresh data on interval.
            this.periodic_check.timer = setInterval(() => {
                this.refresh_data();
            }, this.periodic_check.interval);

        },
        stop_periodic_check() {

            clearInterval(this.periodic_check.timer);
            this.periodic_check.timer = false;

        },
    },
});
