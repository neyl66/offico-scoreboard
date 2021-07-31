
const civ_item = {
    props: [
        "match",
        "steam_id",
        "steam_id_enemy",
        "civ_icon",
        "player_type",
        "index",
    ],
    template: "#civ-item",
    data() {
        return {
            player_index: -1,
            civ_icon_url: "",
        }
    },
    computed: {
        left_px: function() {

            let left_px_start = 0;
            const left_px_step = 30;

            if (this.player_type == "player") {
                left_px_start = 10;
    
                if (this.index == 0) {
                    left_px = left_px_start;
                } else {
                    left_px = left_px_start + (this.index * left_px_step);
                }
    
            } else if (this.player_type == "enemy") {
                left_px_start = 380;
    
                if (this.index == 0) {
                    left_px = left_px_start;
                } else {
                    left_px = left_px_start + (this.index * left_px_step);
                }
    
            }

            return left_px;
        },
    },
    created() {

        if (this.player_type == "player") {
            this.player_index = this.match.players.findIndex(player => player.steam_id == this.steam_id);
        } else if (this.steam_id_enemy) {
            this.player_index = this.match.players.findIndex(player => player.steam_id == this.steam_id_enemy);
        } else if (this.player_type == "enemy") {
            this.player_index = this.match.players.findIndex(player => player.steam_id != this.steam_id);
        }

        if (this.player_index != -1) {
            this.civ_icon_url = this.civ_icon.replace('civ_id', this.match.players[this.player_index].civ);
        }

    },
};

const app = new Vue({
    el: '#app',
    components: {
        "civ-item": civ_item,
    },
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
            from_date: "",
            show_player_civs: "yes",
            show_enemy_civs: "yes",
            steam_id_enemy: "",
        },
        endpoints: {
            "last_matches": "https://aoe2.net/api/player/matches?game=aoe2de",
            "civ_icon": "https://aoe2.club/assets/images/civs/(civ_id).png",
        },
        last_matches:  {
            player: [],
            enemy: [],
        },
        score: {
            wins: 0,
            losses: 0,
            missing: false,
            elo_change: 0,
        },
        is_loading: false,
        current_match: {
            active: false,
            players: [],
        },
        periodic_check: {
            timer: false,
            interval: 60 * 1000,
        },
        civ_id: 0,
        player_index: -1,
    },
    computed: {
        last_matches_url: function() {
            return `${this.endpoints.last_matches}&steam_id=${this.settings.steam_id}&count=${this.settings.matches_count}`;
        },
        last_matches_url_enemy: function() {
            return `${this.endpoints.last_matches}&steam_id=${this.settings.steam_id_enemy}&count=${this.settings.matches_count}`;
        },
    },
    created() {

        // Override settings from url data.
        this.get_url_info();

        // Deduct hours from current time.
        this.change_hours();

        if (this.settings.show_enemy_civs == "yes") {
            this.get_score().then(() => {
                this.get_score("enemy");
            });
        } else {
            this.get_score();
        }

        this.start_periodic_check();

    },
    methods: {
        get_url_info() {
            const url = new URL(window.location.href);
            const search_params = new URLSearchParams(url.search);

            // Available url parameters to override settings.
            const params = ["steam_id", "hours_minus", "matches_count", "num_players", "from_date", "show_player_civs", "show_enemy_civs"];

            // Apply found url params to settings.
            for (let param of params) {
                if (search_params.has(param)) {
                    this.settings[param] = search_params.get(param);
                }
            }

        },
        change_hours() {

            if (this.settings.from_date) {
                // Get time and date from url.
                const datetime = this.settings.from_date.split("-");
                const date = datetime[0].split(".");
                const time = datetime[1].split(":");

                // Create new date.
                let new_date = new Date(date);
                new_date.setHours(time[0]);
                new_date.setMinutes(time[1]);
                new_date = new Date(new_date).setMinutes(time[1]);

                // Save new date.
                this.timeframe = new_date;
                
            } else {
                this.timeframe = Date.now();
            }

            // Change hours based on hours.
            let timeframe_object = new Date(this.timeframe);
            const hours_minus = this.settings.hours_minus;
            timeframe_object.setHours(timeframe_object.getHours() - hours_minus);

            // Save new timeframe.
            this.timeframe = Date.parse(timeframe_object);

        },
        async get_last_matches(player_type = "player") {
            
            let last_matches_url;
            if (player_type == "player") {
                last_matches_url = this.last_matches_url;
            } else if (player_type == "enemy") {
                last_matches_url = this.last_matches_url_enemy;
            }

            // Get last matches from API.
            const result = await fetch(last_matches_url);
            const result_json = await result.json();

            // Store last matches from API.
            const filtered_last_matches = result_json.filter(match => match.num_players == this.settings.num_players);

            if (player_type == "player") {
                //const filtered_last_matches = result_json.filter(match => (match.started * 1000) > this.timeframe);
                this.last_matches.player = filtered_last_matches;
            } else if (player_type == "enemy") {
                //const filtered_last_matches = result_json.filter(match => match.num_players == this.settings.num_players).slice(0, 8);
                this.last_matches.enemy = filtered_last_matches;
            }

            return result_json;
        },
        async get_score(player_type = "player") {

            if (player_type == "enemy") {
                this.get_last_matches(player_type);
                return;
            }

            await this.get_last_matches(player_type).then(last_matches => {
            
                if (last_matches.length < 1) {
                    return;
                }

                // Reset settings.
                this.reset_settings();
    
                // Loop through last matches.
                let first = false;
                for (let i = 0; i < last_matches.length; i++) {
                    const match = last_matches[i];
    
                    // Match data.
                    const started_unix = match.started * 1000;
                    const finished_unix = match.finished * 1000;
                    const players = match.players;
                    const num_players = match.num_players;

                    // Skip games based on number of players.
                    if (num_players != this.settings.num_players) {
                        continue;
                    }

                    // Get steam ID of enemy player in currently played game.
                    if (!first) {
                        const enemy_index = players.findIndex(player => player.steam_id != this.settings.steam_id);
                        this.settings.steam_id_enemy = players[enemy_index].steam_id;

                        first = true;
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

            return;

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

            // Update timeframe to keep in sync.
            this.change_hours();

            if (this.settings.show_enemy_civs == "yes") {
                this.get_score().then(() => {
                    this.get_score("enemy");
                });
            } else {
                this.get_score();
            }

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
