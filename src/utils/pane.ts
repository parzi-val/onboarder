interface Language {
  name: string;
  percentage: number;
}

function getHtml(
  projectName: string,
  fileCount: number,
  languages: Language[]
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        body {
          margin: 0;
          padding: 16px;
          font-family: system-ui, sans-serif;
          background-color: #1e1e1e;
          color: #cccccc;
        }

        .card {
          border: 1px solid #333;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .text {
          font-size: 12px;
          opacity: 0.85;
        }

        .list-item {
          font-size: 12px;
          opacity: 0.85;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="title">Onboarder Project: ${projectName}</div>
        <div class="text">
          Files: ${fileCount}
        </div>
        <div class="text">
          Languages:
        </div>
        ${languages
          .map(
            (lang) =>
              `<div class="list-item">- ${lang.name}: ${lang.percentage}%</div>`
          )
          .join("")}
      </div>

      <div class="card">
        <div class="title">Status</div>
        <div class="text">
          Indexed.
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getLoadingHtml(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        body {
          margin: 0;
          padding: 16px;
          font-family: system-ui, sans-serif;
          background-color: #1e1e1e;
          color: #cccccc;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        .spinner {
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: #cccccc;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .loading-text {
          margin-left: 16px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="spinner"></div>
      <div class="loading-text">Loading project details...</div>
    </body>
    </html>
  `;
}

export default getHtml;