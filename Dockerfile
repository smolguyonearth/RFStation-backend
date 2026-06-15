FROM oven/bun:1
WORKDIR /app

# The asterisks (*) make the lockfiles optional, so Docker won't crash if they are missing
COPY package.json bun.lock* bun.lockb* ./

# Run a standard install
RUN bun install

COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]