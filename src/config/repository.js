// 构建、检查更新和界面入口统一使用当前维护仓库。
const repository = {
  provider: 'github',
  owner: 'Ranshen1209',
  repo: 'YesPlayMusic',
};
const repositoryUrl = `https://github.com/${repository.owner}/${repository.repo}`;

module.exports = {
  repository,
  repositoryUrl,
  releasesUrl: `${repositoryUrl}/releases`,
};
