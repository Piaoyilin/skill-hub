# Skill Registry 数据库

Skill Hub 使用 Prisma + PostgreSQL 作为 Registry 的持久化层，兼容 Supabase 提供的 PostgreSQL 连接串。完整 Skill ZIP 使用独立的 Supabase Storage 私有 Bucket 保存，详见 `docs/storage.md`。

## 数据源

默认数据源是 Mock：

```env
SKILL_DATA_SOURCE=mock
```

切换到数据库查询：

```env
SKILL_DATA_SOURCE=database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/skill_hub?schema=public"
```

数据库模式连接失败时会直接返回错误，不会静默退回 Mock 数据。

## 配置本地环境

在项目根目录创建 `.env.local`，不要把真实连接串提交到 Git：

```env
SKILL_DATA_SOURCE=database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/skill_hub?schema=public"
```

`DATABASE_URL` 可以使用本地 PostgreSQL 或 Supabase PostgreSQL 连接串。连接串中的用户名、密码和主机信息只应保存在本地环境变量中。

切回 Mock 模式时，将 `.env.local` 改为：

```env
SKILL_DATA_SOURCE=mock
```

Mock 模式不需要 `DATABASE_URL`，Database 模式缺少 `DATABASE_URL` 时会直接报错。

## 本地命令

安装依赖后生成 Prisma Client：

```bash
npx prisma generate
```

校验 schema：

```bash
npx prisma validate
```

校验命令需要 `DATABASE_URL` 环境变量；它只解析 schema，不会连接数据库。PowerShell 示例：

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/skill_hub?schema=public"
npx prisma validate
```

有 PostgreSQL 连接后，开发环境可以创建迁移并应用：

```bash
npx prisma migrate dev --name init
npm run db:seed
```

查看数据库内容：

```bash
npx prisma studio
```

启动项目：

```bash
npm run dev
```

迁移和 Seed 会写入配置的数据库；执行前请确认 `DATABASE_URL` 指向正确的开发数据库。不要使用 `prisma migrate reset`，该命令会删除数据库中的数据。

## 模型关系

- `Skill`：平台上的技能展示信息、状态、分类和统计字段。
- `SkillVersion`：一个 Skill 的平台版本、原始 `SKILL.md`、解析后的 manifest 和 changelog。
- `SkillFile`：版本下的文件路径、类型、大小和未来的 `storageKey`，当前不存文件内容。
- `Category`：技能分类。
- `Tag`：技能标签。
- `SkillTag`：Skill 与 Tag 的多对多关系。

同一 Skill 的版本由 `(skillId, version)` 唯一约束保护，同一版本内的文件路径由 `(versionId, path)` 唯一约束保护。公开查询只读取 `PUBLISHED` 且存在已发布版本的 Skill，最新版本按 `publishedAt DESC`、`createdAt DESC` 选择。

## Seed 规则

Seed 复用 `lib/data.ts` 中的 13 个 Mock Skill，保留原有 slug、中文展示名称、简介、分类、标签和主要展示字段。`SKILL.md` 中的 `manifest.name` 使用技术标识，平台展示名称保存在 `Skill.displayName`。

Seed 会使用 `slug` 检查 Skill 是否已存在。已存在的记录会跳过，不更新或删除，因此不会覆盖非 Seed 数据，也不会清空数据库。文件内容目前只在 seed 过程中生成并用于写入 `SkillVersion.skillMd`；`SkillFile` 只保存元数据。

完整 ZIP 上传和下载已通过 Supabase Storage 适配层接入；真实环境需要配置私有 `skill-packages` Bucket 和服务端 Storage 环境变量，具体步骤见 `docs/storage.md`。
