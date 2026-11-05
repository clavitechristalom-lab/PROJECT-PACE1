using Microsoft.EntityFrameworkCore;
using ZLics.InstallmentEngine.Data;
using ZLics.InstallmentEngine.Services;
using ZLics.InstallmentEngine.Workers;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();

// Database Configuration - SQL Server with connection string from configuration
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Server=(localdb)\\mssqllocaldb;Database=ZLicsTradingDb;Trusted_Connection=True;MultipleActiveResultSets=true";

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(30),
            errorNumbersToAdd: null);
    });
});

// Register Domain Services
builder.Services.AddScoped<IInstallmentPaymentService, InstallmentPaymentService>();

// Register Daily Automated Background Penalty Worker
builder.Services.AddSingleton<PenaltyAssessmentWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PenaltyAssessmentWorker>());

// CORS Policy for React Frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontendApp", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173", 
                "http://localhost:3000",
                "http://127.0.0.1:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
app.UseCors("AllowFrontendApp");

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

