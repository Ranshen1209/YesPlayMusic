<template>
  <div v-show="show" class="home">
    <div
      v-if="settings.showPlaylistsByAppleMusic !== false"
      class="index-row first-row"
    >
      <div class="title"> by Apple Music </div>
      <CoverRow
        :type="'playlist'"
        :items="byAppleMusic"
        sub-text="appleMusic"
        :image-size="1024"
      />
    </div>
    <div
      v-if="settings.showRecommendPlaylist !== false"
      class="index-row"
      :class="{ 'first-row': isFirstVisible('recommendPlaylist') }"
    >
      <div class="title">
        {{ $t('home.recommendPlaylist') }}
        <router-link to="/explore?category=推荐歌单">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <CoverRow
        :type="'playlist'"
        :items="visibleRecommendPlaylist"
        sub-text="copywriter"
        :hideable="true"
      />
    </div>
    <div
      v-if="settings.showForYou !== false"
      class="index-row"
      :class="{ 'first-row': isFirstVisible('forYou') }"
    >
      <div class="title"> For You </div>
      <div class="for-you-row">
        <DailyTracksCard ref="DailyTracksCard" />
        <FMCard />
      </div>
    </div>
    <div
      v-if="settings.showRecommendArtist !== false"
      class="index-row"
      :class="{ 'first-row': isFirstVisible('recommendArtist') }"
    >
      <div class="title">{{ $t('home.recommendArtist') }}</div>
      <CoverRow
        type="artist"
        :column-number="6"
        :items="visibleRecommendArtists"
        :hideable="true"
      />
    </div>
    <div
      v-if="
        settings.showFollowedArtists !== false && followedArtists.items.length
      "
      class="index-row"
      :class="{ 'first-row': isFirstVisible('followedArtists') }"
    >
      <div class="title">{{ $t('home.followedArtist') }}</div>
      <CoverRow
        type="artist"
        :column-number="6"
        :items="visibleFollowedArtists"
        :hideable="true"
      />
    </div>
    <div
      v-if="settings.showNewAlbum !== false"
      class="index-row"
      :class="{ 'first-row': isFirstVisible('newAlbum') }"
    >
      <div class="title">
        {{ $t('home.newAlbum') }}
        <router-link to="/new-album">{{ $t('home.seeMore') }}</router-link>
      </div>
      <CoverRow
        type="album"
        :items="visibleNewReleasesAlbum"
        sub-text="artist"
        :hideable="true"
      />
    </div>
    <div
      v-if="settings.showCharts !== false"
      class="index-row"
      :class="{ 'first-row': isFirstVisible('charts') }"
    >
      <div class="title">
        {{ $t('home.charts') }}
        <router-link to="/explore?category=排行榜">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <CoverRow
        type="playlist"
        :items="topList.items"
        sub-text="updateFrequency"
        :image-size="1024"
      />
    </div>
  </div>
</template>

<script>
import { toplists } from '@/api/playlist';
import { toplistOfArtists } from '@/api/artist';
import { newAlbums } from '@/api/album';
import { likedArtists } from '@/api/user';
import { isAccountLoggedIn } from '@/utils/auth';
import { byAppleMusic } from '@/utils/staticData';
import { getRecommendPlayList } from '@/utils/playList';
import NProgress from 'nprogress';
import { mapState } from 'vuex';
import CoverRow from '@/components/CoverRow.vue';
import FMCard from '@/components/FMCard.vue';
import DailyTracksCard from '@/components/DailyTracksCard.vue';

export default {
  name: 'Home',
  components: { CoverRow, FMCard, DailyTracksCard },
  data() {
    return {
      show: false,
      recommendPlaylist: { items: [] },
      newReleasesAlbum: { items: [] },
      topList: {
        items: [],
        ids: [19723756, 180106, 60198, 3812895, 60131],
      },
      recommendArtists: {
        items: [],
        indexs: [],
      },
      followedArtists: {
        items: [],
      },
    };
  },
  computed: {
    ...mapState(['settings', 'data']),
    byAppleMusic() {
      return byAppleMusic;
    },
    hiddenCards() {
      return (
        (this.data && this.data.hiddenCards) || {
          playlist: [],
          artist: [],
          album: [],
        }
      );
    },
    visibleRecommendPlaylist() {
      const ids = (this.hiddenCards.playlist || []).map(x => x.id);
      return this.recommendPlaylist.items.filter(i => !ids.includes(i.id));
    },
    visibleRecommendArtists() {
      const ids = (this.hiddenCards.artist || []).map(x => x.id);
      return this.recommendArtists.items.filter(i => !ids.includes(i.id));
    },
    visibleFollowedArtists() {
      const ids = (this.hiddenCards.artist || []).map(x => x.id);
      return this.followedArtists.items.filter(i => !ids.includes(i.id));
    },
    visibleNewReleasesAlbum() {
      const ids = (this.hiddenCards.album || []).map(x => x.id);
      return this.newReleasesAlbum.items.filter(i => !ids.includes(i.id));
    },
  },
  activated() {
    this.loadData();
    this.$parent.$refs.scrollbar.restorePosition();
  },
  methods: {
    isFirstVisible(section) {
      const order = [
        {
          key: 'appleMusic',
          visible: this.settings.showPlaylistsByAppleMusic !== false,
        },
        {
          key: 'recommendPlaylist',
          visible: this.settings.showRecommendPlaylist !== false,
        },
        { key: 'forYou', visible: this.settings.showForYou !== false },
        {
          key: 'recommendArtist',
          visible: this.settings.showRecommendArtist !== false,
        },
        {
          key: 'followedArtists',
          visible:
            this.settings.showFollowedArtists !== false &&
            this.followedArtists.items.length > 0,
        },
        { key: 'newAlbum', visible: this.settings.showNewAlbum !== false },
        { key: 'charts', visible: this.settings.showCharts !== false },
      ];
      const first = order.find(s => s.visible);
      return first && first.key === section;
    },
    loadData() {
      setTimeout(() => {
        if (!this.show) NProgress.start();
      }, 1000);
      getRecommendPlayList(10, false).then(items => {
        this.recommendPlaylist.items = items;
        NProgress.done();
        this.show = true;
      });
      newAlbums({
        area: this.settings.musicLanguage ?? 'ALL',
        limit: 10,
      }).then(data => {
        this.newReleasesAlbum.items = data.albums;
      });

      const toplistOfArtistsAreaTable = {
        all: null,
        zh: 1,
        ea: 2,
        jp: 4,
        kr: 3,
      };
      toplistOfArtists(
        toplistOfArtistsAreaTable[this.settings.musicLanguage ?? 'all']
      ).then(data => {
        let indexs = [];
        while (indexs.length < 6) {
          let tmp = ~~(Math.random() * 100);
          if (!indexs.includes(tmp)) indexs.push(tmp);
        }
        this.recommendArtists.indexs = indexs;
        this.recommendArtists.items = data.list.artists.filter((l, index) =>
          indexs.includes(index)
        );
      });
      toplists().then(data => {
        this.topList.items = data.list.filter(l =>
          this.topList.ids.includes(l.id)
        );
      });
      this.loadFollowedArtists();
      this.$refs.DailyTracksCard.loadDailyTracks();
    },
    loadFollowedArtists() {
      if (!isAccountLoggedIn()) {
        this.followedArtists.items = [];
        return;
      }
      likedArtists({ limit: 12 })
        .then(result => {
          this.followedArtists.items = (result && result.data) || [];
        })
        .catch(() => {
          this.followedArtists.items = [];
        });
    },
  },
};
</script>

<style lang="scss" scoped>
.index-row {
  margin-top: 54px;
}
.index-row.first-row {
  margin-top: 32px;
}
.playlists {
  display: flex;
  flex-wrap: wrap;
  margin: {
    right: -12px;
    left: -12px;
  }
  .index-playlist {
    margin: 12px 12px 24px 12px;
  }
}

.title {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  a {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.68;
  }
}

footer {
  display: flex;
  justify-content: center;
  margin-top: 48px;
}

.for-you-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-bottom: 78px;
}
</style>
