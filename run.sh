#setup
npm install -g pnpm
pnpm install


#tanstack-start example with Machine Booking System
cd examples/tanstack-start/

# Core dependencies
pnpm install @tanstack/react-start
pnpm add @tanstack/react-table

# Calendar and date handling
pnpm add react-big-calendar@1.19.4 date-fns@^2.30.0

# Type definitions
pnpm add -D @types/react-big-calendar@1.16.3



#redis
docker run -d \
  --name redis \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:alpine

docker exec -it redis redis-cli ping

# Start development server
pnpm dev