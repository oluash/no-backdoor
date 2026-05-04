# =============================================================================
# No-Backdoor System — Nginx Dockerfile
# =============================================================================
# Builds a production-ready Nginx image serving static frontend files
# and proxying API requests to the backend service.
# =============================================================================

FROM nginx:alpine

# Remove default nginx configuration
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy frontend static files (built React app)
COPY dist/ /usr/share/nginx/html/

# Create uploads directory
RUN mkdir -p /usr/share/nginx/uploads

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Expose HTTP port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
