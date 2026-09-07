FROM mcr.microsoft.com/playwright:v1.63.0-noble

RUN apt-get update && \
  # Install Node.js 24, matching the repository's declared runtime.
  apt-get install -y curl wget gpg && \
  curl -sL https://deb.nodesource.com/setup_24.x | bash - && \
  apt-get install -y nodejs && \
  # clean apt cache
  rm -rf /var/lib/apt/lists/*

RUN npm i -g pnpm
COPY ./ /app/

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app
RUN pnpm install
RUN pnpm build

ENV CI=true

CMD /bin/bash
