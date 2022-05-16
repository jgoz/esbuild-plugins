FROM mcr.microsoft.com/playwright:v1.22.0-focal

RUN npm i -g pnpm
COPY ./ /app/

WORKDIR /app
RUN pnpm install
RUN pnpm build

CMD /bin/bash
