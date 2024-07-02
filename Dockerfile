FROM mcr.microsoft.com/playwright:v1.45.1-focal

RUN apt-get update && \
  # Install node18
  apt-get install -y curl wget gpg && \
  curl -sL https://deb.nodesource.com/setup_18.x | bash - && \
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
